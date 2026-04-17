-- Execute no Supabase SQL Editor.
-- Adiciona numero de WhatsApp da profissional nas configuracoes do sistema.

alter table public.config
  add column if not exists professional_whatsapp text;

comment on column public.config.professional_whatsapp is 'WhatsApp da profissional em formato E.164. Ex.: +5511999999999.';

-- Normaliza legado para formato E.164 quando possivel.
update public.config
set professional_whatsapp =
  case
    when coalesce(trim(professional_whatsapp), '') = '' then null
    when regexp_replace(professional_whatsapp, '\\D', '', 'g') ~ '^55\\d{10,11}$'
      then '+' || regexp_replace(professional_whatsapp, '\\D', '', 'g')
    when regexp_replace(professional_whatsapp, '\\D', '', 'g') ~ '^\\d{10,11}$'
      then '+55' || regexp_replace(professional_whatsapp, '\\D', '', 'g')
    when professional_whatsapp ~ '^\\+[1-9]\\d{10,14}$'
      then professional_whatsapp
    else professional_whatsapp
  end;

-- Constraint em modo not valid para nao quebrar dados existentes imediatamente.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'config_professional_whatsapp_e164_check'
      and conrelid = 'public.config'::regclass
  ) then
    alter table public.config
      add constraint config_professional_whatsapp_e164_check
      check (professional_whatsapp is null or professional_whatsapp ~ '^\\+[1-9]\\d{10,14}$')
      not valid;
  end if;
end;
$$;
