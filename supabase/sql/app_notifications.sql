-- Inbox do sininho (notificações dentro do app)
-- Execute no SQL Editor. Também é aplicado junto com public_booking_rpc.sql.

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  operator_id uuid null references public.team_members (id) on delete cascade,
  type text not null default 'public_booking',
  title text not null,
  body text not null default '',
  appointment_id uuid null references public.appointments (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_notifications
  add column if not exists operator_id uuid null references public.team_members (id) on delete cascade;

create index if not exists app_notifications_user_created_idx
  on public.app_notifications (user_id, created_at desc);

create index if not exists app_notifications_user_unread_idx
  on public.app_notifications (user_id)
  where read_at is null;

drop index if exists public.app_notifications_booking_unique_idx;

create unique index if not exists app_notifications_booking_operator_unique_idx
  on public.app_notifications (user_id, operator_id, appointment_id)
  where appointment_id is not null and operator_id is not null;

create index if not exists app_notifications_operator_idx
  on public.app_notifications (user_id, operator_id, created_at desc);

comment on table public.app_notifications is
  'Avisos no sininho, por perfil da equipe (operator_id).';

alter table public.app_notifications enable row level security;

drop policy if exists app_notifications_own_select on public.app_notifications;
create policy app_notifications_own_select
  on public.app_notifications for select
  using (auth.uid() = user_id);

drop policy if exists app_notifications_own_update on public.app_notifications;
create policy app_notifications_own_update
  on public.app_notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists app_notifications_own_delete on public.app_notifications;
create policy app_notifications_own_delete
  on public.app_notifications for delete
  using (auth.uid() = user_id);

drop policy if exists app_notifications_own_insert on public.app_notifications;
create policy app_notifications_own_insert
  on public.app_notifications for insert
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.app_notifications to authenticated;

alter table public.app_notifications replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.app_notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
