-- Sistema de fidelidade (selos via QR code)
-- Execute no SQL Editor do Supabase.
--
-- Fluxo: a cliente abre /fidelidade/<professional_id>, informa telefone e/ou
-- nome e vê seu cartão com um QR code (token de uso único, expira em 5 min).
-- A profissional escaneia esse QR no app (autenticada) para registrar 1 selo.
-- Não existe marcação automática pelo agendamento: todo selo passa pelo scan,
-- para a experiência ser igual para clientes que vieram pelo link ou não.

create table if not exists public.loyalty_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goal_count integer not null default 10 check (goal_count > 0),
  reward_description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_stamps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  team_member_id uuid null references public.team_members(id) on delete set null,
  source text not null default 'qr',
  created_at timestamptz not null default now(),
  redeemed_at timestamptz null
);

create index if not exists loyalty_stamps_client_idx on public.loyalty_stamps (user_id, client_id, redeemed_at);

create table if not exists public.loyalty_scan_tokens (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz null,
  used_by_team_member_id uuid null references public.team_members(id) on delete set null
);

create index if not exists loyalty_scan_tokens_lookup_idx on public.loyalty_scan_tokens (token, user_id);

create or replace function public.set_loyalty_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists loyalty_config_set_updated_at on public.loyalty_config;
create trigger loyalty_config_set_updated_at
before update on public.loyalty_config
for each row execute function public.set_loyalty_config_updated_at();

alter table public.loyalty_config enable row level security;
alter table public.loyalty_stamps enable row level security;
alter table public.loyalty_scan_tokens enable row level security;

drop policy if exists loyalty_config_owner_all on public.loyalty_config;
create policy loyalty_config_owner_all
  on public.loyalty_config for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists loyalty_stamps_owner_select on public.loyalty_stamps;
create policy loyalty_stamps_owner_select
  on public.loyalty_stamps for select
  using (auth.uid() = user_id);

-- Sem policies de insert/update em loyalty_stamps e loyalty_scan_tokens:
-- toda escrita acontece via funções security definer abaixo.

-- ─── Card público (leitura, gera token novo a cada chamada) ────────────────

create or replace function public.get_public_loyalty_card(
  p_professional_id uuid,
  p_client_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client record;
  v_cfg record;
  v_count int;
  v_token uuid;
  v_expires timestamptz;
  v_professional_name text;
begin
  if p_professional_id is null or p_client_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  select id, name into v_client
  from public.clients
  where id = p_client_id and user_id = p_professional_id
  limit 1;

  if v_client.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select goal_count, reward_description, active
  into v_cfg
  from public.loyalty_config
  where user_id = p_professional_id
  limit 1;

  if v_cfg.goal_count is null then
    v_cfg.goal_count := 10;
    v_cfg.reward_description := '';
    v_cfg.active := true;
  end if;

  select count(*) into v_count
  from public.loyalty_stamps
  where user_id = p_professional_id
    and client_id = p_client_id
    and redeemed_at is null;

  select u.raw_user_meta_data ->> 'name'
  into v_professional_name
  from auth.users u
  where u.id = p_professional_id
  limit 1;

  v_expires := now() + interval '5 minutes';

  insert into public.loyalty_scan_tokens (user_id, client_id, expires_at)
  values (p_professional_id, p_client_id, v_expires)
  returning token into v_token;

  return jsonb_build_object(
    'ok', true,
    'client_id', v_client.id,
    'client_name', v_client.name,
    'professional_name', coalesce(nullif(trim(v_professional_name), ''), 'Seu salão'),
    'goal', v_cfg.goal_count,
    'reward_description', v_cfg.reward_description,
    'active', v_cfg.active,
    'stamped_count', v_count,
    'qr_token', v_token,
    'qr_expires_at', v_expires
  );
end;
$$;

grant execute on function public.get_public_loyalty_card(uuid, uuid) to anon, authenticated;

-- ─── Busca por telefone e/ou nome (pode devolver várias candidatas) ────────

create or replace function public.get_public_loyalty_lookup(
  p_professional_id uuid,
  p_phone text,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_digits text;
  v_phone_candidates text[];
  v_name_trim text;
  v_matches record;
  v_count int;
  v_single_id uuid;
begin
  if p_professional_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  v_phone_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_phone_digits := regexp_replace(v_phone_digits, '^0+', '', 'g');
  v_name_trim := nullif(trim(coalesce(p_name, '')), '');

  if char_length(v_phone_digits) >= 8 then
    v_phone_candidates := array_remove(array[
      case when left(v_phone_digits, 2) = '55' and char_length(v_phone_digits) > 2 then '+' || v_phone_digits else null end,
      case when char_length(v_phone_digits) >= 8 and char_length(v_phone_digits) <= 11 then '+55' || v_phone_digits else null end,
      case when char_length(v_phone_digits) >= 12 and char_length(v_phone_digits) <= 15 then '+' || v_phone_digits else null end
    ], null);

    select count(*) into v_count
    from public.clients c
    where c.user_id = p_professional_id and c.phone = any (v_phone_candidates);

    if v_count = 0 then
      return jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;

    if v_count = 1 then
      select c.id into v_single_id
      from public.clients c
      where c.user_id = p_professional_id and c.phone = any (v_phone_candidates)
      limit 1;
      return jsonb_build_object('ok', true, 'mode', 'card') || public.get_public_loyalty_card(p_professional_id, v_single_id);
    end if;

    return jsonb_build_object(
      'ok', true,
      'mode', 'choice',
      'candidates', (
        select jsonb_agg(jsonb_build_object('client_id', c.id, 'name', c.name, 'phone', c.phone))
        from public.clients c
        where c.user_id = p_professional_id and c.phone = any (v_phone_candidates)
      )
    );
  end if;

  if v_name_trim is null or char_length(v_name_trim) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  select count(*) into v_count
  from public.clients c
  where c.user_id = p_professional_id and c.name ilike v_name_trim || '%';

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_count = 1 then
    select c.id into v_single_id
    from public.clients c
    where c.user_id = p_professional_id and c.name ilike v_name_trim || '%'
    limit 1;
    return jsonb_build_object('ok', true, 'mode', 'card') || public.get_public_loyalty_card(p_professional_id, v_single_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'mode', 'choice',
    'candidates', (
      select jsonb_agg(jsonb_build_object('client_id', c.id, 'name', c.name, 'phone', c.phone))
      from (
        select c.id, c.name, c.phone
        from public.clients c
        where c.user_id = p_professional_id and c.name ilike v_name_trim || '%'
        order by c.name
        limit 8
      ) c
    )
  );
end;
$$;

grant execute on function public.get_public_loyalty_lookup(uuid, text, text) to anon, authenticated;

-- ─── Resgate do scan (autenticado: profissional logada na conta) ──────────

create or replace function public.redeem_loyalty_scan_token(
  p_token uuid,
  p_team_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_row record;
  v_count int;
  v_goal int;
  v_reward text;
  v_client_name text;
  v_unlocked boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_row
  from public.loyalty_scan_tokens
  where token = p_token
    and user_id = v_uid
    and used_at is null
    and expires_at > now()
  limit 1;

  if v_row.token is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_or_expired');
  end if;

  update public.loyalty_scan_tokens
  set used_at = now(), used_by_team_member_id = p_team_member_id
  where token = p_token;

  insert into public.loyalty_stamps (user_id, client_id, team_member_id, source)
  values (v_uid, v_row.client_id, p_team_member_id, 'qr');

  select goal_count, reward_description
  into v_goal, v_reward
  from public.loyalty_config
  where user_id = v_uid
  limit 1;

  if v_goal is null then
    v_goal := 10;
    v_reward := '';
  end if;

  select count(*) into v_count
  from public.loyalty_stamps
  where user_id = v_uid and client_id = v_row.client_id and redeemed_at is null;

  if v_count >= v_goal then
    update public.loyalty_stamps
    set redeemed_at = now()
    where id in (
      select id from public.loyalty_stamps
      where user_id = v_uid and client_id = v_row.client_id and redeemed_at is null
      order by created_at asc
      limit v_goal
    );
    v_unlocked := true;
    v_count := v_count - v_goal;
  end if;

  select name into v_client_name from public.clients where id = v_row.client_id;

  return jsonb_build_object(
    'ok', true,
    'client_id', v_row.client_id,
    'client_name', v_client_name,
    'stamped_count', v_count,
    'goal', v_goal,
    'reward_unlocked', v_unlocked,
    'reward_description', v_reward
  );
end;
$$;

grant execute on function public.redeem_loyalty_scan_token(uuid, uuid) to authenticated;
