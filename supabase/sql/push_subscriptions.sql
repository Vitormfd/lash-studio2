-- Push Web (VAPID) — subscriptions por dispositivo / endpoint
-- Execute no SQL Editor após autenticação existir.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  keys_p256dh text not null,
  keys_auth text not null,
  morning_enabled boolean not null default true,
  reminder_minutes_before integer not null default 60,
  progress_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_own_select"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "push_own_insert"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "push_own_update"
  on public.push_subscriptions for update
  using (auth.uid() = user_id);

create policy "push_own_delete"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

comment on table public.push_subscriptions is 'Endpoints Web Push (VAPID) para envio via Edge Function / cron.';
