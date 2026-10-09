-- Confirmação do agendamento público pelo WhatsApp da profissional.
-- Depois de agendar pelo link, a cliente vê um botão que abre o WhatsApp
-- da profissional com uma mensagem pronta (texto configurável em Configurações).
alter table public.config
  add column if not exists business_whatsapp text,
  add column if not exists booking_confirm_template text;

comment on column public.config.business_whatsapp is
  'WhatsApp da profissional (só dígitos, com DDD) que recebe a confirmação da cliente após o agendamento público.';
comment on column public.config.booking_confirm_template is
  'Mensagem pronta que a cliente envia ao confirmar o agendamento público. Vazio = texto padrão do app.';

create or replace function public.get_public_booking_contact(p_professional_id uuid)
returns table (
  whatsapp text,
  confirm_template text
)
language sql
security definer
set search_path = public
as $$
  select
    nullif(regexp_replace(coalesce(c.business_whatsapp, ''), '[^0-9]', '', 'g'), '') as whatsapp,
    nullif(trim(c.booking_confirm_template), '') as confirm_template
  from public.config c
  where c.user_id = p_professional_id
  limit 1;
$$;

grant execute on function public.get_public_booking_contact(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
