-- P1 da auditoria (18/11/2026): agenda.
--
-- 1. Status "no_show" (Faltou): libera o horário como o cancelado, no link público também.
-- 2. Trava no banco contra dois agendamentos no mesmo horário (antes a checagem era só na
--    tela, com os dados carregados na abertura: uma reserva online feita enquanto o app
--    estava aberto podia virar horário duplo). Vale para agendamentos novos e remarcados;
--    os 9 pares sobrepostos que já existem não travam a edição.
-- 3. Agenda em tempo real: appointments entra na publicação do Realtime (respeita o RLS).
-- 4. Confirmação por resposta no WhatsApp: colunas em config.
--
-- Aplicar: npx supabase db query --linked -f supabase/sql/p1_agenda.sql

begin;

-- ─── 2. Trava de horário duplo ───────────────────────────────────────────────

create or replace function public.prevent_appointment_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_new_start int;
  v_new_end int;
begin
  -- Cancelado ou falta não ocupa horário.
  if coalesce(new.status, 'pending') in ('cancelled', 'no_show') then
    return new;
  end if;

  -- Na edição, só confere quando muda dia, hora, duração ou quando volta a ocupar o horário.
  if tg_op = 'UPDATE'
     and new.date is not distinct from old.date
     and new.time is not distinct from old.time
     and coalesce(new.duration_minutes, 60) = coalesce(old.duration_minutes, 60)
     and coalesce(old.status, 'pending') not in ('cancelled', 'no_show') then
    return new;
  end if;

  if new.date is null or new.time is null then
    return new;
  end if;

  -- Uma gravação por vez no mesmo dia da mesma conta.
  perform pg_advisory_xact_lock(hashtextextended('appt_day:' || new.user_id::text || ':' || new.date::text, 0));

  v_new_start := extract(hour from new.time)::int * 60 + extract(minute from new.time)::int;
  v_new_end := v_new_start + coalesce(nullif(new.duration_minutes, 0), 60);

  if exists (
    select 1
    from public.appointments a
    where a.user_id = new.user_id
      and a.date = new.date
      and a.id <> new.id
      and coalesce(a.status, 'pending') not in ('cancelled', 'no_show')
      and v_new_start < (extract(hour from a.time)::int * 60 + extract(minute from a.time)::int + coalesce(nullif(a.duration_minutes, 0), 60))
      and (extract(hour from a.time)::int * 60 + extract(minute from a.time)::int) < v_new_end
  ) then
    raise exception 'horario_ocupado: já existe um agendamento ou bloqueio nesse horário'
      using errcode = 'P0001';
  end if;

  return new;
end;
$fn$;

revoke execute on function public.prevent_appointment_overlap() from public, anon, authenticated;

drop trigger if exists trg_appointments_prevent_overlap on public.appointments;
create trigger trg_appointments_prevent_overlap
  before insert or update on public.appointments
  for each row execute function public.prevent_appointment_overlap();

-- ─── 1. Faltou libera o horário no link público ─────────────────────────────

create or replace function public.get_public_booking_occupied_slots(p_professional_id uuid, p_date date)
returns table(slot_time time without time zone, duration_minutes integer)
language sql
security definer
set search_path = public
as $fn$
  select
    a.time as slot_time,
    coalesce(a.duration_minutes, 60) as duration_minutes
  from public.appointments a
  where a.user_id = p_professional_id
    and a.date = p_date
    and coalesce(a.status, 'pending') not in ('cancelled', 'no_show');
$fn$;

create or replace function public.create_public_booking(
  p_professional_id uuid,
  p_service_id uuid,
  p_date date,
  p_time time without time zone,
  p_client_name text,
  p_client_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service record;
  v_duration int;
  v_name text;
  v_phone_digits text;
  v_phone_candidates text[];
  v_client_id uuid;
  v_appointment_id uuid;
  v_conflict boolean;
  v_win record;
  v_start_mins int;
  v_end_mins int;
  v_slot_mins int;
  v_lunch_start_mins int;
  v_lunch_end_mins int;
  v_notif_body text;
  v_today date;
  v_recent int;
begin
  -- Marca a transação como agendamento público para passar pelo gatilho de acesso.
  perform set_config('app.public_booking', 'true', true);

  if p_professional_id is null or p_service_id is null or p_date is null or p_time is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  -- Agenda online só para contas com acesso completo (assinatura ativa, liberação manual ou teste em dia).
  if not public.is_full_access(p_professional_id) then
    return jsonb_build_object('ok', false, 'reason', 'plan_required');
  end if;

  v_name := left(regexp_replace(trim(coalesce(p_client_name, '')), '\s+', ' ', 'g'), 80);
  if char_length(v_name) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;

  v_phone_digits := regexp_replace(coalesce(p_client_phone, ''), '[^0-9]', '', 'g');
  v_phone_digits := regexp_replace(v_phone_digits, '^0+', '', 'g');
  if char_length(v_phone_digits) < 10 or char_length(v_phone_digits) > 13 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;

  v_phone_candidates := array_remove(array[
    case when left(v_phone_digits, 2) = '55' and char_length(v_phone_digits) >= 12 then '+' || v_phone_digits else null end,
    case when char_length(v_phone_digits) <= 11 then '+55' || v_phone_digits else null end
  ], null);
  if coalesce(array_length(v_phone_candidates, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;

  -- "Hoje" pelo fuso mais a oeste do Brasil, para não recusar ninguém do Acre ou do Amazonas.
  -- Horário de hoje que já passou é barrado na tela.
  v_today := (now() at time zone 'America/Rio_Branco')::date;
  if p_date < v_today then
    return jsonb_build_object('ok', false, 'reason', 'past_date');
  end if;
  if p_date > v_today + 365 then
    return jsonb_build_object('ok', false, 'reason', 'too_far');
  end if;

  -- Uma reserva por vez na agenda desta profissional (evita duas pessoas no mesmo horário).
  perform pg_advisory_xact_lock(hashtextextended('public_booking:' || p_professional_id::text, 0));

  -- Limites contra reservas em massa (o pico real é de 5 por hora numa conta).
  select count(*) into v_recent
  from public.appointments a
  where a.user_id = p_professional_id
    and a.notes = 'Agendamento público'
    and a.created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select count(*) into v_recent
  from public.appointments a
  where a.user_id = p_professional_id
    and a.notes = 'Agendamento público'
    and a.created_at > now() - interval '1 day';
  if v_recent >= 60 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select count(*) into v_recent
  from public.appointments a
  join public.clients c on c.id = a.client_id
  where a.user_id = p_professional_id
    and c.phone = any (v_phone_candidates)
    and a.notes = 'Agendamento público'
    and a.date >= v_today
    and coalesce(a.status, 'pending') in ('pending', 'confirmed');
  if v_recent >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_bookings');
  end if;

  select
    s.id,
    s.name,
    s.price,
    coalesce(nullif(to_jsonb(s) ->> 'duration_minutes', '')::int, 60) as duration_minutes
  into v_service
  from public.services s
  where s.id = p_service_id
    and s.user_id = p_professional_id
  limit 1;

  if v_service.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_service');
  end if;

  v_duration := coalesce(v_service.duration_minutes, 60);

  -- Valida horário de trabalho do dia
  select *
  into v_win
  from public.get_public_booking_window(p_professional_id, p_date)
  limit 1;

  if coalesce(v_win.closed, false) then
    return jsonb_build_object('ok', false, 'reason', 'outside_hours');
  end if;

  if v_win.start_time is not null and v_win.end_time is not null then
    v_start_mins := (split_part(v_win.start_time, ':', 1)::int * 60)
      + split_part(v_win.start_time, ':', 2)::int;
    v_end_mins := (split_part(v_win.end_time, ':', 1)::int * 60)
      + split_part(v_win.end_time, ':', 2)::int;
    v_slot_mins := extract(hour from p_time)::int * 60 + extract(minute from p_time)::int;
    if v_slot_mins < v_start_mins or (v_slot_mins + v_duration) > v_end_mins then
      return jsonb_build_object('ok', false, 'reason', 'outside_hours');
    end if;

    if coalesce(v_win.has_lunch, false) and v_win.lunch_start is not null and v_win.lunch_end is not null then
      v_lunch_start_mins := (split_part(v_win.lunch_start, ':', 1)::int * 60)
        + split_part(v_win.lunch_start, ':', 2)::int;
      v_lunch_end_mins := (split_part(v_win.lunch_end, ':', 1)::int * 60)
        + split_part(v_win.lunch_end, ':', 2)::int;
      if v_slot_mins < v_lunch_end_mins and (v_slot_mins + v_duration) > v_lunch_start_mins then
        return jsonb_build_object('ok', false, 'reason', 'outside_hours');
      end if;
    end if;
  end if;

  select exists (
    select 1
    from public.appointments a
    where a.user_id = p_professional_id
      and a.date = p_date
      and coalesce(a.status, 'pending') not in ('cancelled', 'no_show')
      and (
        (extract(hour from p_time) * 60 + extract(minute from p_time))
          < (extract(hour from a.time) * 60 + extract(minute from a.time) + coalesce(a.duration_minutes, 60))
        and
        (extract(hour from a.time) * 60 + extract(minute from a.time))
          < (extract(hour from p_time) * 60 + extract(minute from p_time) + v_duration)
      )
  ) into v_conflict;

  if v_conflict then
    return jsonb_build_object('ok', false, 'reason', 'conflict');
  end if;

  select c.id
  into v_client_id
  from public.clients c
  where c.user_id = p_professional_id
    and c.phone = any (v_phone_candidates)
  limit 1;

  if v_client_id is null then
    v_client_id := gen_random_uuid();
    insert into public.clients (id, user_id, name, phone, notes, created_at)
    values (
      v_client_id,
      p_professional_id,
      v_name,
      v_phone_candidates[1],
      'Criado via agendamento público.',
      now()
    );
  end if;

  v_appointment_id := gen_random_uuid();

  insert into public.appointments (
    id,
    user_id,
    client_id,
    service_id,
    date,
    time,
    value,
    notes,
    status,
    blocked,
    duration_minutes
  )
  values (
    v_appointment_id,
    p_professional_id,
    v_client_id,
    p_service_id,
    p_date,
    p_time,
    v_service.price,
    'Agendamento público',
    'pending',
    false,
    v_duration
  );

  -- Inbox do sininho: um aviso por perfil da equipe (best-effort)
  v_notif_body :=
    case
      when nullif(trim(coalesce(v_service.name, '')), '') is not null then
        v_name || ' agendou ' || trim(v_service.name)
        || ' para ' || to_char(p_date, 'DD/MM') || ' às ' || to_char(p_time, 'HH24:MI')
      else
        v_name || ' agendou para ' || to_char(p_date, 'DD/MM') || ' às ' || to_char(p_time, 'HH24:MI')
    end;

  begin
    perform public.insert_team_app_notifications(
      p_professional_id,
      'public_booking',
      'Novo agendamento',
      v_notif_body,
      v_appointment_id,
      jsonb_build_object(
        'date', p_date,
        'time', to_char(p_time, 'HH24:MI'),
        'clientName', v_name,
        'serviceName', coalesce(v_service.name, '')
      )
    );
  exception
    when others then
      null;
  end;

  -- Avisa a profissional (best-effort). Falha de push não cancela o agendamento.
  begin
    perform
      net.http_post(
        url := 'https://mbxfswxjrdikdyzpukmw.supabase.co/functions/v1/send-scheduled-pushes',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'mode', 'new_booking',
          'appointment_id', v_appointment_id
        )
      );
  exception
    when others then
      null;
  end;

  return jsonb_build_object('ok', true, 'appointment_id', v_appointment_id);
exception
  when others then
    if sqlerrm ilike '%full plan required%' then
      return jsonb_build_object('ok', false, 'reason', 'plan_required');
    end if;
    if sqlerrm ilike '%horario_ocupado%' then
      return jsonb_build_object('ok', false, 'reason', 'conflict');
    end if;
    -- O detalhe fica só no log do banco; quem agenda vê uma mensagem genérica.
    raise warning 'create_public_booking falhou (profissional %): %', p_professional_id, sqlerrm;
    return jsonb_build_object('ok', false, 'reason', 'unexpected_error');
end;
$$;

-- ─── 4. Confirmação por resposta no WhatsApp ────────────────────────────────
-- Ligada por padrão: o lembrete pede "responda SIM" e a resposta confirma o horário.
alter table public.config add column if not exists whatsapp_confirm_by_reply boolean not null default true;
-- Quando o webhook da Evolution (mensagens recebidas) foi ligado para a instância atual.
alter table public.config add column if not exists whatsapp_webhook_at timestamptz;

-- ─── 3. Realtime ─────────────────────────────────────────────────────────────

do $do$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end
$do$;

commit;
notify pgrst, 'reload schema';
