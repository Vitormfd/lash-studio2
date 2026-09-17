-- Apelido (slug) para o link público de fidelidade, ex: /fidelidade/estudio-da-ana
-- em vez de /fidelidade/<uuid>. Execute depois de supabase/sql/loyalty.sql.

alter table public.loyalty_config
  add column if not exists slug text;

create unique index if not exists loyalty_config_slug_unique
  on public.loyalty_config (lower(slug))
  where slug is not null;

-- Resolve um identificador do link público (uuid OU slug) para o user_id real.
create or replace function public.get_public_loyalty_professional_id(p_identifier text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text;
  v_uid uuid;
begin
  v_clean := nullif(trim(coalesce(p_identifier, '')), '');
  if v_clean is null then
    return null;
  end if;

  if v_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_clean::uuid;
  end if;

  select user_id into v_uid
  from public.loyalty_config
  where lower(slug) = lower(v_clean)
  limit 1;

  return v_uid;
end;
$$;

grant execute on function public.get_public_loyalty_professional_id(text) to anon, authenticated;
