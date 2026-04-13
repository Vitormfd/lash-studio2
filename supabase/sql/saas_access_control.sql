-- SaaS access model for demo/full monetization
-- Execute in Supabase SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'active', 'canceled')),
  access_level text not null default 'demo' check (access_level in ('demo', 'full')),
  professional_type text not null default 'lash' check (professional_type in ('lash', 'nail', 'sobrancelha', 'estetica')),
  subscription_expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists professional_type text;

update public.profiles
set professional_type = 'lash'
where professional_type is null;

alter table public.profiles
alter column professional_type set default 'lash';

alter table public.profiles
alter column professional_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_professional_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_professional_type_check
      check (professional_type in ('lash', 'nail', 'sobrancelha', 'estetica'));
  end if;
end;
$$;

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_profiles_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, plan, access_level, professional_type)
  values (
    new.id,
    'free',
    'demo',
    case
      when coalesce(new.raw_user_meta_data ->> 'professional_type', '') in ('lash', 'nail', 'sobrancelha', 'estetica')
        then new.raw_user_meta_data ->> 'professional_type'
      else 'lash'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

insert into public.profiles (id, plan, access_level, professional_type)
select
  u.id,
  'free',
  'demo',
  case
    when coalesce(u.raw_user_meta_data ->> 'professional_type', '') in ('lash', 'nail', 'sobrancelha', 'estetica')
      then u.raw_user_meta_data ->> 'professional_type'
    else 'lash'
  end
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_own_select'
  ) then
    create policy profiles_own_select
      on public.profiles for select
      using (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_own_update'
  ) then
    create policy profiles_own_update
      on public.profiles for update
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_own_insert'
  ) then
    create policy profiles_own_insert
      on public.profiles for insert
      with check (auth.uid() = id);
  end if;
end;
$$;

create or replace function public.is_full_access(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.access_level = 'full'
      and (
        p.subscription_expires_at is null
        or p.subscription_expires_at > now()
      )
  );
$$;

create or replace function public.enforce_full_access_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  role_claim text;
begin
  role_claim := current_setting('request.jwt.claim.role', true);

  if role_claim = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  target_user_id := case
    when tg_op = 'DELETE' then old.user_id
    else new.user_id
  end;

  if target_user_id is null or target_user_id <> auth.uid() then
    raise exception 'Unauthorized user context for write operation.';
  end if;

  if not public.is_full_access(target_user_id) then
    raise exception 'Access denied: full plan required for this operation.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'clients',
    'services',
    'appointments',
    'inventory_items',
    'inventory_movements',
    'config'
  ]
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = tbl
        and column_name = 'user_id'
    ) then
      execute format('drop trigger if exists trg_%I_enforce_full_access on public.%I;', tbl, tbl);
      execute format(
        'create trigger trg_%I_enforce_full_access before insert or update or delete on public.%I for each row execute function public.enforce_full_access_write();',
        tbl,
        tbl
      );
    end if;
  end loop;
end;
$$;
