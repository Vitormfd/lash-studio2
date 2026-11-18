-- Correções de segurança P0 (auditoria de 18/11/2026).
--
-- 1. Fidelidade pública: a busca por nome devolvia nome e telefone de qualquer cliente
--    de qualquer profissional (bastava o id do link de agendamento e duas letras).
--    Agora só busca por telefone completo, só mostra o primeiro nome e só funciona
--    com a fidelidade ativa e a conta com acesso.
-- 2. insert_team_app_notifications e account_owner_id podiam ser chamadas por qualquer
--    pessoa sem login (notificação falsa no sininho de qualquer conta). Agora só o
--    próprio banco (funções internas) e o service_role chamam.
-- 3. Agendamento público: telefone e nome obrigatórios, sem data passada nem a mais de
--    1 ano, limite de reservas por hora/dia por profissional e por telefone, trava
--    contra duas reservas simultâneas no mesmo dia e sem devolver erro interno.
--
-- Aplicar: npx supabase db query --linked -f supabase/sql/seguranca_p0.sql

begin;

-- ─── 2. Funções internas fora do alcance de anon/authenticated ───────────────

revoke execute on function public.insert_team_app_notifications(uuid, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.insert_team_app_notifications(uuid, text, text, text, uuid, jsonb) to service_role;

revoke execute on function public.account_owner_id(uuid) from public, anon, authenticated;
grant execute on function public.account_owner_id(uuid) to service_role;

-- ─── 1. Fidelidade pública ───────────────────────────────────────────────────

-- Fidelidade disponível para o público: conta com acesso e fidelidade não desligada.
create or replace function public.loyalty_public_available(p_professional_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_full_access(p_professional_id)
     and coalesce((select lc.active from public.loyalty_config lc where lc.user_id = p_professional_id limit 1), true);
$$;

revoke execute on function public.loyalty_public_available(uuid) from public, anon, authenticated;
grant execute on function public.loyalty_public_available(uuid) to service_role;

create or replace function public.get_public_loyalty_card(p_professional_id uuid, p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client record;
  v_cfg record;
  v_count int;
  v_token uuid;
  v_expires timestamptz;
  v_professional_name text;
begin
  if p_professional_id is null or p_client_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  if not public.loyalty_public_available(p_professional_id) then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  select id, name into v_client
  from public.clients
  where id = p_client_id and user_id = p_professional_id
  limit 1;

  if v_client.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select goal_count, reward_description, active
  into v_cfg
  from public.loyalty_config
  where user_id = p_professional_id
  limit 1;

  if v_cfg.goal_count is null then
    v_cfg.goal_count := 10;
    v_cfg.reward_description := '';
    v_cfg.active := true;
  end if;

  select count(*) into v_count
  from public.loyalty_stamps
  where user_id = p_professional_id
    and client_id = p_client_id
    and redeemed_at is null;

  select u.raw_user_meta_data ->> 'name'
  into v_professional_name
  from auth.users u
  where u.id = p_professional_id
  limit 1;

  -- O cartão se renova a cada poucos minutos: apaga os códigos vencidos e não usados desta cliente.
  delete from public.loyalty_scan_tokens
  where user_id = p_professional_id
    and client_id = p_client_id
    and used_at is null
    and expires_at < now();

  v_expires := now() + interval '5 minutes';

  insert into public.loyalty_scan_tokens (user_id, client_id, expires_at)
  values (p_professional_id, p_client_id, v_expires)
  returning token into v_token;

  return jsonb_build_object(
    'ok', true,
    'client_id', v_client.id,
    -- Só o primeiro nome: o link é público.
    'client_name', split_part(trim(coalesce(v_client.name, '')), ' ', 1),
    'professional_name', coalesce(nullif(trim(v_professional_name), ''), 'Seu salão'),
    'goal', v_cfg.goal_count,
    'reward_description', v_cfg.reward_description,
    'active', v_cfg.active,
    'stamped_count', v_count,
    'qr_token', v_token,
    'qr_expires_at', v_expires
  );
end;
$$;

-- Busca só por telefone completo (com DDD). A busca por nome foi removida: ela
-- permitia listar a carteira de clientes de qualquer profissional.
create or replace function public.get_public_loyalty_lookup(p_professional_id uuid, p_phone text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_digits text;
  v_phone_candidates text[];
  v_count int;
  v_single_id uuid;
begin
  if p_professional_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  if not public.loyalty_public_available(p_professional_id) then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  v_phone_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_phone_digits := regexp_replace(v_phone_digits, '^0+', '', 'g');

  -- Telefone com DDD: 10 ou 11 dígitos, ou 12/13 com o 55 na frente.
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

  select count(*) into v_count
  from public.clients c
  where c.user_id = p_professional_id and c.phone = any (v_phone_candidates);

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_count = 1 then
    select c.id into v_single_id
    from public.clients c
    where c.user_id = p_professional_id and c.phone = any (v_phone_candidates)
    limit 1;
    return jsonb_build_object('ok', true, 'mode', 'card') || public.get_public_loyalty_card(p_professional_id, v_single_id);
  end if;

  -- Mesmo telefone para mais de uma pessoa (ex.: mãe e filha): só o primeiro nome, sem telefone.
  return jsonb_build_object(
    'ok', true,
    'mode', 'choice',
    'candidates', (
      select jsonb_agg(jsonb_build_object('client_id', x.id, 'name', x.first_name))
      from (
        select c.id, split_part(trim(coalesce(c.name, '')), ' ', 1) as first_name
        from public.clients c
        where c.user_id = p_professional_id and c.phone = any (v_phone_candidates)
        order by c.name
        limit 8
      ) x
    )
  );
end;
$$;

-- ─── 3. Agendamento público ──────────────────────────────────────────────────

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
      and coalesce(a.status, 'pending') <> 'cancelled'
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
    -- O detalhe fica só no log do banco; quem agenda vê uma mensagem genérica.
    raise warning 'create_public_booking falhou (profissional %): %', p_professional_id, sqlerrm;
    return jsonb_build_object('ok', false, 'reason', 'unexpected_error');
end;
$$;

commit;
