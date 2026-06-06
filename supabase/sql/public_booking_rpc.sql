-- Public booking RPCs (anonymous-safe)
-- Execute in Supabase SQL Editor.

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

create or replace function public.get_public_booking_window(p_professional_id uuid)
returns table (
  start_time text,
  end_time text
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(
      nullif(to_jsonb(c) ->> 'start_time', ''),
      nullif(to_jsonb(c) ->> 'start_hour', ''),
      nullif(to_jsonb(c) ->> 'work_start', ''),
      nullif(to_jsonb(c) ->> 'working_start', ''),
      nullif(to_jsonb(c) ->> 'opening_hour', ''),
      nullif(to_jsonb(c) ->> 'business_start', ''),
      '08:00'
    ) as start_time,
    coalesce(
      nullif(to_jsonb(c) ->> 'end_time', ''),
      nullif(to_jsonb(c) ->> 'end_hour', ''),
      nullif(to_jsonb(c) ->> 'work_end', ''),
      nullif(to_jsonb(c) ->> 'working_end', ''),
      nullif(to_jsonb(c) ->> 'closing_hour', ''),
      nullif(to_jsonb(c) ->> 'business_end', ''),
      '18:00'
    ) as end_time
  from public.config c
  where c.user_id = p_professional_id
  limit 1;
$$;

grant execute on function public.get_public_booking_window(uuid) to anon, authenticated;

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
begin
  -- Mark this transaction as a public booking to bypass the write access trigger
  perform set_config('app.public_booking', 'true', true);

  if p_professional_id is null or p_service_id is null or p_date is null or p_time is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  select
    s.id,
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
