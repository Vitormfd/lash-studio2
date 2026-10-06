-- Simulador de Cílios — geração com IA (Gemini), controle de custo.
-- Execute DEPOIS de lash_simulator.sql. Idempotente. Só cria objetos novos.
--
-- Cada chamada de IA vira uma linha em lash_simulator_ai_requests:
--   pending → done (conta na cota) | failed (não conta: devolvida automaticamente).
-- Somente a Edge Function lash-simulator-ai (service role) reserva e finaliza.

create table if not exists public.lash_simulator_ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  model text null,
  error text null check (error is null or char_length(error) <= 500),
  duration_ms integer null,
  created_at timestamptz not null default now(),
  finished_at timestamptz null
);

create index if not exists lash_simulator_ai_requests_user_created_idx
  on public.lash_simulator_ai_requests (user_id, created_at desc);

alter table public.lash_simulator_ai_requests enable row level security;

drop policy if exists lash_simulator_ai_requests_select_own on public.lash_simulator_ai_requests;
create policy lash_simulator_ai_requests_select_own
  on public.lash_simulator_ai_requests for select
  using (auth.uid() = user_id);
-- Sem policies de escrita: só a service role grava.

-- Limite mensal de gerações com IA. Ponto único para planos/créditos.
create or replace function public.lash_simulator_ai_monthly_limit(p_user_id uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.is_lash_designer(p_user_id) then 0
    when public.is_full_access(p_user_id) then 100
    else 3 -- conta em teste: algumas gerações para conhecer o recurso
  end;
$$;

revoke all on function public.lash_simulator_ai_monthly_limit(uuid) from public, anon;
grant execute on function public.lash_simulator_ai_monthly_limit(uuid) to authenticated;

create or replace function public.lash_simulator_ai_used(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.lash_simulator_ai_requests
  where user_id = p_user_id
    and status in ('pending', 'done')
    and created_at >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
$$;

revoke all on function public.lash_simulator_ai_used(uuid) from public, anon, authenticated;

-- Reserva uma geração. Retorna { ok, id } ou { ok:false, reason }.
-- Regras: perfil lash, cota mensal, uma geração por vez, no máximo 8 em 10 minutos.
create or replace function public.lash_simulator_ai_reserve(p_user_id uuid, p_model text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_used integer;
  v_recent integer;
  v_id uuid;
begin
  -- Serializa reservas da mesma profissional (evita corrida entre abas).
  perform pg_advisory_xact_lock(hashtext('lash_ai_' || p_user_id::text));

  if not public.is_lash_designer(p_user_id) then
    return json_build_object('ok', false, 'reason', 'not_lash');
  end if;

  -- Pendentes antigas (função caiu) viram falha e não contam.
  update public.lash_simulator_ai_requests
     set status = 'failed', error = 'stale', finished_at = now()
   where user_id = p_user_id and status = 'pending' and created_at < now() - interval '3 minutes';

  if exists (
    select 1 from public.lash_simulator_ai_requests
    where user_id = p_user_id and status = 'pending'
  ) then
    return json_build_object('ok', false, 'reason', 'in_progress');
  end if;

  select count(*) into v_recent
  from public.lash_simulator_ai_requests
  where user_id = p_user_id and created_at > now() - interval '10 minutes';
  if v_recent >= 8 then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  v_limit := public.lash_simulator_ai_monthly_limit(p_user_id);
  v_used := public.lash_simulator_ai_used(p_user_id);
  if v_used >= v_limit then
    return json_build_object('ok', false, 'reason', 'monthly_limit', 'limit', v_limit);
  end if;

  insert into public.lash_simulator_ai_requests (user_id, model)
  values (p_user_id, left(p_model, 80))
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id, 'used', v_used + 1, 'limit', v_limit);
end;
$$;

create or replace function public.lash_simulator_ai_finish(p_id uuid, p_ok boolean, p_error text default null, p_duration_ms integer default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.lash_simulator_ai_requests
     set status = case when p_ok then 'done' else 'failed' end,
         error = left(p_error, 500),
         duration_ms = p_duration_ms,
         finished_at = now()
   where id = p_id and status = 'pending';
$$;

-- Só a service role (Edge Function) reserva e finaliza.
revoke all on function public.lash_simulator_ai_reserve(uuid, text) from public, anon, authenticated;
revoke all on function public.lash_simulator_ai_finish(uuid, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.lash_simulator_ai_reserve(uuid, text) to service_role;
grant execute on function public.lash_simulator_ai_finish(uuid, boolean, text, integer) to service_role;
grant execute on function public.lash_simulator_ai_used(uuid) to service_role;

-- Cota para a interface: salvas + IA.
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
    'limit', public.lash_simulator_monthly_limit(auth.uid()),
    'ai_used', public.lash_simulator_ai_used(auth.uid()),
    'ai_limit', public.lash_simulator_ai_monthly_limit(auth.uid())
  )
  where public.is_lash_designer(auth.uid());
$$;

revoke all on function public.lash_simulator_quota() from public, anon;
grant execute on function public.lash_simulator_quota() to authenticated;
