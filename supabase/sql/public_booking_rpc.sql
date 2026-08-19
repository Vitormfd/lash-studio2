-- Public booking RPCs (anonymous-safe)
-- Execute in Supabase SQL Editor.
--
-- Depois deste SQL, faça o deploy da Edge Function:
--   supabase functions deploy send-scheduled-pushes --no-verify-jwt
-- Ela envia push para a profissional quando alguém agenda pelo link público.
-- Também grava o aviso no sininho (tabela app_notifications).

alter table public.appointments
  add column if not exists owner_notified_at timestamptz null;

comment on column public.appointments.owner_notified_at is
  'Quando a profissional foi avisada de um agendamento público (web push).';

create or replace function public.get_public_booking_services(p_professional_id uuid)
returns table (
  id uuid,
  name text,
  price numeric,
  duration_minutes integer
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.price,
    coalesce(nullif(to_jsonb(s) ->> 'duration_minutes', '')::int, 60) as duration_minutes
  from public.services s
  where s.user_id = p_professional_id
  order by s.name;
$$;

grant execute on function public.get_public_booking_services(uuid) to anon, authenticated;

create or replace function public.get_public_booking_occupied_slots(
  p_professional_id uuid,
  p_date date
)
returns table (
  slot_time time,
  duration_minutes integer
)
language sql
security definer
set search_path = public
as $$
  select
    a.time as slot_time,
    coalesce(a.duration_minutes, 60) as duration_minutes
  from public.appointments a
  where a.user_id = p_professional_id
    and a.date = p_date
    and coalesce(a.status, 'pending') <> 'cancelled';
$$;

grant execute on function public.get_public_booking_occupied_slots(uuid, date) to anon, authenticated;

-- DROP necessary when signature / return columns change
drop function if exists public.get_public_booking_window(uuid);
drop function if exists public.get_public_booking_window(uuid, date);

create or replace function public.get_public_booking_window(
  p_professional_id uuid,
  p_date date default null
)
returns table (
  start_time text,
  end_time text,
  closed boolean,
  state_uf text,
  city text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg jsonb;
  v_hours jsonb;
  v_day jsonb;
  v_key text;
  v_dow int;
  v_closed boolean;
  v_start text;
  v_end text;
  v_state text;
  v_city text;
begin
  select to_jsonb(c)
  into v_cfg
  from public.config c
  where c.user_id = p_professional_id
  limit 1;

  if v_cfg is null then
    start_time := '08:00';
    end_time := '18:00';
    closed := false;
    state_uf := null;
    city := null;
    return next;
    return;
  end if;

  v_state := nullif(v_cfg ->> 'state_uf', '');
  v_city := nullif(v_cfg ->> 'city', '');
  v_hours := v_cfg -> 'work_hours';

  v_dow := extract(dow from coalesce(p_date, current_date))::int;
  v_key := case v_dow
    when 0 then 'sun'
    when 1 then 'mon'
    when 2 then 'tue'
    when 3 then 'wed'
    when 4 then 'thu'
    when 5 then 'fri'
    else 'sat'
  end;

  if v_hours is not null and jsonb_typeof(v_hours) = 'object' then
    v_day := v_hours -> v_key;
  end if;

  if v_day is not null and jsonb_typeof(v_day) = 'object' then
    v_closed := coalesce((v_day ->> 'closed')::boolean, false);
    v_start := nullif(v_day ->> 'start', '');
    v_end := nullif(v_day ->> 'end', '');
  else
    -- fallback legado: janela única
    v_closed := false;
    v_start := coalesce(
      nullif(v_cfg ->> 'start_time', ''),
      nullif(v_cfg ->> 'start_hour', ''),
      nullif(v_cfg ->> 'work_start', ''),
      '08:00'
    );
    v_end := coalesce(
      nullif(v_cfg ->> 'end_time', ''),
      nullif(v_cfg ->> 'end_hour', ''),
      nullif(v_cfg ->> 'work_end', ''),
      '18:00'
    );
  end if;

  if v_closed then
    start_time := null;
    end_time := null;
    closed := true;
    state_uf := v_state;
    city := v_city;
    return next;
    return;
  end if;

  start_time := coalesce(v_start, '08:00');
  end_time := coalesce(v_end, '18:00');
  closed := false;
  state_uf := v_state;
  city := v_city;
  return next;
end;
$$;

grant execute on function public.get_public_booking_window(uuid, date) to anon, authenticated;

create or replace function public.create_public_booking(
  p_professional_id uuid,
  p_service_id uuid,
  p_date date,
  p_time time,
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
  v_phone_digits text;
  v_phone_e164 text;
  v_phone_candidates text[];
  v_client_id uuid;
  v_appointment_id uuid;
  v_conflict boolean;
  v_win record;
  v_start_mins int;
  v_end_mins int;
  v_slot_mins int;
begin
  -- Mark this transaction as a public booking to bypass the write access trigger
  perform set_config('app.public_booking', 'true', true);

  if p_professional_id is null or p_service_id is null or p_date is null or p_time is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
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

  v_phone_digits := regexp_replace(coalesce(p_client_phone, ''), '[^0-9]', '', 'g');
  v_phone_digits := regexp_replace(v_phone_digits, '^0+', '', 'g');

  v_phone_candidates := array_remove(array[
    case
      when left(v_phone_digits, 2) = '55' and char_length(v_phone_digits) > 2 then '+' || v_phone_digits
      else null
    end,
    case
      when char_length(v_phone_digits) >= 8 and char_length(v_phone_digits) <= 11 then '+55' || v_phone_digits
      else null
    end,
    case
      when char_length(v_phone_digits) >= 12 and char_length(v_phone_digits) <= 15 then '+' || v_phone_digits
      else null
    end
  ], null);

  v_phone_e164 := v_phone_candidates[1];

  select c.id
  into v_client_id
  from public.clients c
  where c.user_id = p_professional_id
    and c.phone = any (v_phone_candidates)
  limit 1;

  if v_client_id is null then
    v_client_id := gen_random_uuid();
    begin
      insert into public.clients (id, user_id, name, phone, notes, created_at)
      values (
        v_client_id,
        p_professional_id,
        coalesce(nullif(trim(p_client_name), ''), 'Cliente'),
        v_phone_candidates[1],
        'Criado via agendamento público.',
        now()
      );
    exception
      when others then
        begin
          insert into public.clients (id, user_id, name, phone, notes, created_at)
          values (
            v_client_id,
            p_professional_id,
            coalesce(nullif(trim(p_client_name), ''), 'Cliente'),
            null,
            'Criado via agendamento público.',
            now()
          );
        exception
          when others then
            return jsonb_build_object('ok', false, 'reason', 'client_insert_failed', 'detail', sqlerrm);
        end;
    end;
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

  -- Inbox do sininho (best-effort)
  begin
    insert into public.app_notifications (
      user_id,
      type,
      title,
      body,
      appointment_id,
      payload
    )
    values (
      p_professional_id,
      'public_booking',
      'Novo agendamento',
      case
        when nullif(trim(coalesce(v_service.name, '')), '') is not null then
          coalesce(nullif(trim(p_client_name), ''), 'Cliente')
          || ' agendou '
          || trim(v_service.name)
          || ' para '
          || to_char(p_date, 'DD/MM')
          || ' às '
          || to_char(p_time, 'HH24:MI')
        else
          coalesce(nullif(trim(p_client_name), ''), 'Cliente')
          || ' agendou para '
          || to_char(p_date, 'DD/MM')
          || ' às '
          || to_char(p_time, 'HH24:MI')
      end,
      v_appointment_id,
      jsonb_build_object(
        'date', p_date,
        'time', to_char(p_time, 'HH24:MI'),
        'clientName', coalesce(nullif(trim(p_client_name), ''), 'Cliente'),
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
    return jsonb_build_object('ok', false, 'reason', 'unexpected_error', 'detail', sqlerrm);
end;
$$;

grant execute on function public.create_public_booking(uuid, uuid, date, time, text, text) to anon, authenticated;
