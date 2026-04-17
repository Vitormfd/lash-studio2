-- Adiciona suporte ao tipo profissional "barbeiro"
-- Execute no Supabase SQL Editor (sem alterar os arquivos existentes).

-- 1. Atualiza o CHECK CONSTRAINT da tabela profiles para aceitar 'barbeiro'
alter table public.profiles
  drop constraint if exists profiles_professional_type_check;

alter table public.profiles
  add constraint profiles_professional_type_check
  check (professional_type in ('lash', 'nail', 'sobrancelha', 'estetica', 'barbeiro'));

-- 2. Atualiza a função de trigger que cria o perfil ao cadastrar novo usuário
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
      when coalesce(new.raw_user_meta_data ->> 'professional_type', '') in ('lash', 'nail', 'sobrancelha', 'estetica', 'barbeiro')
        then new.raw_user_meta_data ->> 'professional_type'
      else 'lash'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3. Cria perfil para usuários existentes que ainda não têm registro em profiles
insert into public.profiles (id, plan, access_level, professional_type)
select
  u.id,
  'free',
  'demo',
  case
    when coalesce(u.raw_user_meta_data ->> 'professional_type', '') in ('lash', 'nail', 'sobrancelha', 'estetica', 'barbeiro')
      then u.raw_user_meta_data ->> 'professional_type'
    else 'lash'
  end
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
