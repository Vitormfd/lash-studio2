-- Tema visual da conta (aplicado também nas páginas públicas: agenda e fidelidade)
alter table public.config
  add column if not exists theme_id text;

comment on column public.config.theme_id is
  'Tema visual escolhido pela profissional (rose, lavender, ocean, emerald, terracotta, dark). Usado no app e nas páginas públicas.';

create or replace function public.get_public_theme_id(p_professional_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select nullif(trim(c.theme_id), '')
  from public.config c
  where c.user_id = p_professional_id
  limit 1;
$$;

grant execute on function public.get_public_theme_id(uuid) to anon, authenticated;
