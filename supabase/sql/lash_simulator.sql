-- Simulador de Cílios (exclusivo para professional_type = 'lash')
-- Execute no SQL Editor do Supabase. Idempotente: pode rodar mais de uma vez.
-- Só cria objetos novos; não altera tabelas existentes.
--
-- • lash_simulations: histórico de simulações salvas (uma linha por simulação)
-- • lash_simulator_usage: contador mensal de simulações salvas (base para limites por plano)
-- • bucket privado lash-simulations: <user_id>/<simulation_id>/{original,result}.jpg

-- ─── Quem pode usar ───────────────────────────────────────────────────────────
create or replace function public.is_lash_designer(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.professional_type = 'lash'
  );
$$;

-- Limite mensal de simulações salvas. Ponto único para regras por plano/créditos.
create or replace function public.lash_simulator_monthly_limit(p_user_id uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_full_access(p_user_id) then 300
    else 0
  end;
$$;

revoke all on function public.is_lash_designer(uuid) from public, anon;
grant execute on function public.is_lash_designer(uuid) to authenticated;
revoke all on function public.lash_simulator_monthly_limit(uuid) from public, anon;
grant execute on function public.lash_simulator_monthly_limit(uuid) to authenticated;

-- ─── Histórico ────────────────────────────────────────────────────────────────
create table if not exists public.lash_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('upload', 'model')),
  model_id text null check (model_id is null or char_length(model_id) <= 64),
  original_path text null check (original_path is null or char_length(original_path) <= 300),
  result_path text not null check (char_length(result_path) <= 300),
  technique text not null check (char_length(technique) between 1 and 48),
  volume_d smallint null check (volume_d is null or volume_d between 1 and 30),
  curl text not null check (char_length(curl) between 1 and 8),
  thickness_mm numeric(4, 2) not null check (thickness_mm > 0 and thickness_mm <= 0.5),
  classic_thickness_mm numeric(4, 2) null check (classic_thickness_mm is null or (classic_thickness_mm > 0 and classic_thickness_mm <= 0.5)),
  mapping text not null check (char_length(mapping) between 1 and 48),
  mapping_lengths jsonb not null check (jsonb_typeof(mapping_lengths) = 'array' and jsonb_array_length(mapping_lengths) between 3 and 30),
  texture text null check (texture is null or char_length(texture) <= 24),
  settings_version smallint not null default 1,
  created_at timestamptz not null default now()
);

comment on table public.lash_simulations is
  'Simulador de Cílios: histórico por profissional. Arquivos no bucket privado lash-simulations.';

create index if not exists lash_simulations_user_created_idx
  on public.lash_simulations (user_id, created_at desc);

create table if not exists public.lash_simulator_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  saved_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.lash_simulations enable row level security;
alter table public.lash_simulator_usage enable row level security;

drop policy if exists lash_simulations_select_own on public.lash_simulations;
create policy lash_simulations_select_own
  on public.lash_simulations for select
  using (auth.uid() = user_id and public.is_lash_designer(auth.uid()));

drop policy if exists lash_simulations_insert_own on public.lash_simulations;
create policy lash_simulations_insert_own
  on public.lash_simulations for insert
  with check (auth.uid() = user_id and public.is_lash_designer(auth.uid()));

-- Excluir é sempre permitido para a dona (privacidade), mesmo sem plano ativo.
drop policy if exists lash_simulations_delete_own on public.lash_simulations;
create policy lash_simulations_delete_own
  on public.lash_simulations for delete
  using (auth.uid() = user_id);

-- Sem policy de update: registros são imutáveis.

drop policy if exists lash_simulator_usage_select_own on public.lash_simulator_usage;
create policy lash_simulator_usage_select_own
  on public.lash_simulator_usage for select
  using (auth.uid() = user_id);
-- Escrita no contador só pelo trigger (security definer).

-- Regras de gravação: perfil Lash, plano completo, limite mensal e anti-rajada.
create or replace function public.lash_simulations_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_limit integer;
  v_used integer;
  v_recent integer;
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if new.user_id is distinct from auth.uid() then
    raise exception 'lash_sim_unauthorized' using errcode = '42501';
  end if;

  if not public.is_lash_designer(new.user_id) then
    raise exception 'lash_sim_not_lash' using errcode = '42501';
  end if;

  if not public.is_full_access(new.user_id) then
    raise exception 'lash_sim_full_access_required' using errcode = '42501';
  end if;

  -- Arquivos precisam estar na pasta da própria profissional.
  if split_part(new.result_path, '/', 1) <> new.user_id::text
     or (new.original_path is not null and split_part(new.original_path, '/', 1) <> new.user_id::text) then
    raise exception 'lash_sim_bad_path' using errcode = '42501';
  end if;

  select count(*) into v_recent
  from public.lash_simulations
  where user_id = new.user_id and created_at > now() - interval '1 minute';
  if v_recent >= 6 then
    raise exception 'lash_sim_rate_limited' using errcode = 'P0001';
  end if;

  v_limit := public.lash_simulator_monthly_limit(new.user_id);
  select coalesce(saved_count, 0) into v_used
  from public.lash_simulator_usage
  where user_id = new.user_id and month = v_month;
  if coalesce(v_used, 0) >= v_limit then
    raise exception 'lash_sim_monthly_limit' using errcode = 'P0001';
  end if;

  insert into public.lash_simulator_usage (user_id, month, saved_count, updated_at)
  values (new.user_id, v_month, 1, now())
  on conflict (user_id, month)
  do update set saved_count = public.lash_simulator_usage.saved_count + 1, updated_at = now();

  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists trg_lash_simulations_before_insert on public.lash_simulations;
create trigger trg_lash_simulations_before_insert
before insert on public.lash_simulations
for each row execute function public.lash_simulations_before_insert();

-- Uso do mês para a interface: { used, limit }.
create or replace function public.lash_simulator_quota()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'used', coalesce((
      select saved_count from public.lash_simulator_usage
      where user_id = auth.uid()
        and month = date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
    ), 0),
    'limit', public.lash_simulator_monthly_limit(auth.uid())
  )
  where public.is_lash_designer(auth.uid());
$$;

revoke all on function public.lash_simulator_quota() from public, anon;
grant execute on function public.lash_simulator_quota() to authenticated;

-- ─── Storage (privado) ────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lash-simulations', 'lash-simulations', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists lash_sim_storage_select on storage.objects;
create policy lash_sim_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lash-simulations'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_lash_designer(auth.uid())
  );

drop policy if exists lash_sim_storage_insert on storage.objects;
create policy lash_sim_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lash-simulations'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_lash_designer(auth.uid())
    and public.is_full_access(auth.uid())
  );

drop policy if exists lash_sim_storage_delete on storage.objects;
create policy lash_sim_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'lash-simulations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
