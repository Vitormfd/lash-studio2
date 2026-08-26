-- Vincula push e sininho ao perfil da equipe (PIN).
-- Execute no SQL Editor depois de team_members_and_audit.sql, push_subscriptions.sql
-- e app_notifications.sql. Depois faça o deploy da Edge Function send-scheduled-pushes.
--
-- Dona da conta = primeira pessoa cadastrada em team_members (created_at).
-- Agendamento interno de funcionário → só a dona.
-- Agendamento público → todos os perfis ativos.

alter table public.push_subscriptions
  add column if not exists operator_id uuid null references public.team_members (id) on delete set null;

create index if not exists push_subscriptions_operator_idx
  on public.push_subscriptions (user_id, operator_id);

comment on column public.push_subscriptions.operator_id is
  'Perfil da equipe (PIN) que ativou o push neste aparelho.';

alter table public.app_notifications
  add column if not exists operator_id uuid null references public.team_members (id) on delete cascade;

drop index if exists public.app_notifications_booking_unique_idx;

create unique index if not exists app_notifications_booking_operator_unique_idx
  on public.app_notifications (user_id, operator_id, appointment_id)
  where appointment_id is not null and operator_id is not null;

create index if not exists app_notifications_operator_idx
  on public.app_notifications (user_id, operator_id, created_at desc);

comment on column public.app_notifications.operator_id is
  'Perfil que deve ver o aviso no sininho. Null = legado (só a dona vê).';

drop policy if exists app_notifications_own_insert on public.app_notifications;
create policy app_notifications_own_insert
  on public.app_notifications for insert
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.app_notifications to authenticated;

-- Avisos antigos (sem perfil) ficam com a dona da conta
update public.app_notifications n
set operator_id = (
  select m.id
  from public.team_members m
  where m.user_id = n.user_id
    and m.active = true
  order by m.created_at asc, m.id asc
  limit 1
)
where n.operator_id is null;

create or replace function public.account_owner_id(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id
  from public.team_members m
  where m.user_id = p_user_id
    and m.active = true
  order by m.created_at asc, m.id asc
  limit 1;
$$;

comment on function public.account_owner_id(uuid) is
  'Primeira pessoa ativa cadastrada na equipe (dona da conta).';

grant execute on function public.account_owner_id(uuid) to authenticated, service_role;

-- Cria um aviso no sininho para cada perfil ativo (ou um legado se ainda não houver equipe)
create or replace function public.insert_team_app_notifications(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_appointment_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  begin
    insert into public.app_notifications (
      user_id, operator_id, type, title, body, appointment_id, payload
    )
    select
      p_user_id,
      m.id,
      coalesce(nullif(trim(p_type), ''), 'public_booking'),
      p_title,
      coalesce(p_body, ''),
      p_appointment_id,
      coalesce(p_payload, '{}'::jsonb)
    from public.team_members m
    where m.user_id = p_user_id
      and m.active = true
    on conflict do nothing;

    get diagnostics v_count = row_count;

    if v_count = 0 then
      insert into public.app_notifications (
        user_id, type, title, body, appointment_id, payload
      )
      values (
        p_user_id,
        coalesce(nullif(trim(p_type), ''), 'public_booking'),
        p_title,
        coalesce(p_body, ''),
        p_appointment_id,
        coalesce(p_payload, '{}'::jsonb)
      )
      on conflict do nothing;
    end if;
  exception
    when undefined_column then
      insert into public.app_notifications (
        user_id, type, title, body, appointment_id, payload
      )
      values (
        p_user_id,
        coalesce(nullif(trim(p_type), ''), 'public_booking'),
        p_title,
        coalesce(p_body, ''),
        p_appointment_id,
        coalesce(p_payload, '{}'::jsonb)
      )
      on conflict do nothing;
    when others then
      null;
  end;
end;
$$;

create or replace function public.trg_fanout_public_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_name text;
  v_service_name text;
  v_body text;
  v_hhmm text;
begin
  if coalesce(new.notes, '') is distinct from 'Agendamento público' then
    return new;
  end if;

  select coalesce(nullif(trim(name), ''), 'Cliente')
  into v_client_name
  from public.clients
  where id = new.client_id;

  select coalesce(nullif(trim(name), ''), '')
  into v_service_name
  from public.services
  where id = new.service_id;

  v_hhmm := to_char(new.time, 'HH24:MI');
  v_body :=
    case
      when coalesce(v_service_name, '') <> '' then
        coalesce(v_client_name, 'Cliente')
        || ' agendou '
        || v_service_name
        || ' para '
        || to_char(new.date, 'DD/MM')
        || ' às '
        || v_hhmm
      else
        coalesce(v_client_name, 'Cliente')
        || ' agendou para '
        || to_char(new.date, 'DD/MM')
        || ' às '
        || v_hhmm
    end;

  perform public.insert_team_app_notifications(
    new.user_id,
    'public_booking',
    'Novo agendamento',
    v_body,
    new.id,
    jsonb_build_object(
      'date', new.date,
      'time', v_hhmm,
      'clientName', coalesce(v_client_name, 'Cliente'),
      'serviceName', coalesce(v_service_name, '')
    )
  );

  delete from public.app_notifications
  where appointment_id = new.id
    and user_id = new.user_id
    and operator_id is null;

  return new;
end;
$$;

drop trigger if exists trg_fanout_public_booking_notifications on public.appointments;
create trigger trg_fanout_public_booking_notifications
after insert on public.appointments
for each row execute procedure public.trg_fanout_public_booking_notifications();

-- Se o RPC antigo ainda gravar um aviso sem perfil, descarta quando já existem avisos por operador
create or replace function public.trg_skip_unscoped_public_booking_inbox()
returns trigger
language plpgsql
as $$
begin
  if new.operator_id is null
     and new.appointment_id is not null
     and exists (
       select 1
       from public.app_notifications n
       where n.user_id = new.user_id
         and n.appointment_id = new.appointment_id
         and n.operator_id is not null
         and n.id is distinct from new.id
     )
  then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_skip_unscoped_public_booking_inbox on public.app_notifications;
create trigger trg_skip_unscoped_public_booking_inbox
before insert on public.app_notifications
for each row execute procedure public.trg_skip_unscoped_public_booking_inbox();
