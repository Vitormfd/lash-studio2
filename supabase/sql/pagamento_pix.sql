-- Pagamento por Pix (Stripe, pagamento avulso): cada Pix pago libera 30 dias de acesso.
--
-- pix_payments guarda cada pagamento (um por sessão de checkout da Stripe), o que:
--   - impede liberar duas vezes se a Stripe reenviar o mesmo aviso (webhook);
--   - deixa o app saber que o acesso atual veio de Pix, para mostrar "Renovar com Pix".
--
-- grant_pix_access é chamada só pelo webhook (service_role). Soma os dias ao que ainda
-- resta: quem renova antes do fim não perde nada.

create table if not exists public.pix_payments (
  checkout_session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null,
  days integer not null,
  paid_at timestamptz not null default now(),
  access_until timestamptz not null
);

create index if not exists pix_payments_user_paid_idx on public.pix_payments (user_id, paid_at desc);

alter table public.pix_payments enable row level security;

drop policy if exists pix_payments_own_select on public.pix_payments;
create policy pix_payments_own_select
  on public.pix_payments for select
  using (auth.uid() = user_id);

create or replace function public.grant_pix_access(
  p_session_id text,
  p_user_id uuid,
  p_amount_cents integer,
  p_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_base timestamptz;
  v_until timestamptz;
begin
  if p_session_id is null or p_user_id is null or coalesce(p_days, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  -- Mesmo pagamento já processado: não soma de novo.
  if exists (select 1 from public.pix_payments where checkout_session_id = p_session_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  select plan, access_level, subscription_expires_at
    into v_profile
    from public.profiles
   where id = p_user_id
   for update;

  -- Conta paga sem data de fim (cartão antigo ou liberação manual): só registra o Pix.
  if found and v_profile.plan = 'active' and v_profile.access_level = 'full'
     and v_profile.subscription_expires_at is null then
    insert into public.pix_payments (checkout_session_id, user_id, amount_cents, days, access_until)
    values (p_session_id, p_user_id, p_amount_cents, p_days, now());
    return jsonb_build_object('ok', true, 'unchanged', true, 'reason', 'unlimited_access');
  end if;

  v_base := now();
  if found and v_profile.plan = 'active' and v_profile.access_level = 'full'
     and v_profile.subscription_expires_at > now() then
    v_base := v_profile.subscription_expires_at;
  end if;
  v_until := v_base + make_interval(days => p_days);

  insert into public.pix_payments (checkout_session_id, user_id, amount_cents, days, access_until)
  values (p_session_id, p_user_id, p_amount_cents, p_days, v_until);

  -- manual_grant = true: um evento antigo de cartão recusado/expirado não derruba o acesso pago no Pix.
  -- O vencimento continua valendo (is_full_access respeita subscription_expires_at).
  insert into public.profiles (id, plan, access_level, subscription_expires_at, manual_grant)
  values (p_user_id, 'active', 'full', v_until, true)
  on conflict (id) do update
    set plan = 'active',
        access_level = 'full',
        subscription_expires_at = v_until,
        manual_grant = true;

  return jsonb_build_object('ok', true, 'access_until', v_until);
end;
$$;

revoke all on function public.grant_pix_access(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.grant_pix_access(text, uuid, integer, integer) to service_role;
