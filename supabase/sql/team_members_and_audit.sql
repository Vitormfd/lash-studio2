-- Operadores da equipe (sem login) + histórico de alterações
-- Execute no SQL Editor do Supabase.
-- A primeira pessoa cadastrada (created_at) é a dona da conta.

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  pin_hash text null,
  color text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_members_user_id_idx on public.team_members (user_id);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operator_id uuid null references public.team_members(id) on delete set null,
  operator_name text not null default 'Desconhecido',
  action text not null check (action in ('create', 'update', 'delete')),
  entity_type text not null,
  entity_id uuid null,
  summary text not null,
  payload jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_user_id_created_idx on public.audit_log (user_id, created_at desc);

create or replace function public.set_team_members_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists team_members_set_updated_at on public.team_members;
create trigger team_members_set_updated_at
before update on public.team_members
for each row execute function public.set_team_members_updated_at();

alter table public.team_members enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists team_members_own_select on public.team_members;
create policy team_members_own_select
  on public.team_members for select
  using (auth.uid() = user_id);

drop policy if exists team_members_own_insert on public.team_members;
create policy team_members_own_insert
  on public.team_members for insert
  with check (auth.uid() = user_id);

drop policy if exists team_members_own_update on public.team_members;
create policy team_members_own_update
  on public.team_members for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists team_members_own_delete on public.team_members;
create policy team_members_own_delete
  on public.team_members for delete
  using (auth.uid() = user_id);

drop policy if exists audit_log_own_select on public.audit_log;
create policy audit_log_own_select
  on public.audit_log for select
  using (auth.uid() = user_id);

drop policy if exists audit_log_own_insert on public.audit_log;
create policy audit_log_own_insert
  on public.audit_log for insert
  with check (auth.uid() = user_id);

-- team_members segue as mesmas regras de plano completo das demais tabelas
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'team_members' and column_name = 'user_id'
  ) then
    execute 'drop trigger if exists trg_team_members_enforce_full_access on public.team_members';
    execute $trg$
      create trigger trg_team_members_enforce_full_access
      before insert or update or delete on public.team_members
      for each row execute function public.enforce_full_access_write()
    $trg$;
  end if;
end;
$$;
