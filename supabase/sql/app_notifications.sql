-- Inbox do sininho (notificações dentro do app)
-- Execute no SQL Editor. Também é aplicado junto com public_booking_rpc.sql.

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'public_booking',
  title text not null,
  body text not null default '',
  appointment_id uuid null references public.appointments (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_notifications_user_created_idx
  on public.app_notifications (user_id, created_at desc);

create index if not exists app_notifications_user_unread_idx
  on public.app_notifications (user_id)
  where read_at is null;

create unique index if not exists app_notifications_booking_unique_idx
  on public.app_notifications (user_id, appointment_id)
  where appointment_id is not null;

comment on table public.app_notifications is
  'Avisos da profissional no sininho do app (ex.: agendamento público).';

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

grant select, update, delete on public.app_notifications to authenticated;

alter table public.app_notifications replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.app_notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
