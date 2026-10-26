-- Teste grátis de 7 dias sem cartão + trava dos campos de cobrança em profiles.
-- Aplicar com: npx supabase db query --linked -f supabase/sql/trial_sem_cartao.sql
-- Depois rodar: notify pgrst, 'reload schema';

-- 1) Novo plano "trial"
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free', 'trial', 'active', 'canceled'));

-- 2) Toda conta nova nasce com 7 dias de acesso completo.
--    is_full_access() já respeita subscription_expires_at, então o bloqueio após o
--    vencimento vale no banco (escritas em clients, appointments etc.), não só na tela.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, plan, access_level, professional_type, subscription_expires_at)
  values (
    new.id,
    'trial',
    'full',
    case
      when coalesce(new.raw_user_meta_data ->> 'professional_type', '') in ('lash', 'nail', 'sobrancelha', 'estetica', 'barbeiro')
        then new.raw_user_meta_data ->> 'professional_type'
      else 'lash'
    end,
    now() + interval '7 days'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3) Trava: o próprio usuário (papéis anon/authenticated via API) não pode mudar
--    plano, nível de acesso, vencimento nem manual_grant. Funções security definer
--    (cadastro) e o service_role (webhook da Stripe, sync) continuam podendo.
--    A função NÃO é security definer de propósito: current_user precisa ser o papel da requisição.
create or replace function public.guard_profile_billing_fields()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- O app só insere perfil quando ele não existe (fallback); nunca com acesso pago.
    new.plan := 'free';
    new.access_level := 'demo';
    new.subscription_expires_at := null;
    new.manual_grant := false;
    return new;
  end if;

  new.plan := old.plan;
  new.access_level := old.access_level;
  new.subscription_expires_at := old.subscription_expires_at;
  new.manual_grant := old.manual_grant;
  return new;
end;
$$;

drop trigger if exists profiles_guard_billing_fields on public.profiles;
create trigger profiles_guard_billing_fields
before insert or update on public.profiles
for each row execute function public.guard_profile_billing_fields();

-- 4) Quem se cadastrou desde o início da campanha (20/10) e ficou travado no cartão
--    ganha os 7 dias a partir de agora.
update public.profiles p
set plan = 'trial',
    access_level = 'full',
    subscription_expires_at = now() + interval '7 days'
from auth.users u
where u.id = p.id
  and u.created_at >= '2026-10-20 19:00:00+00'
  and p.plan = 'free'
  and p.access_level = 'demo'
  and coalesce(p.manual_grant, false) = false;
