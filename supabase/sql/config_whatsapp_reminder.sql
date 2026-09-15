-- Mensagem editável do lembrete WhatsApp (botão na agenda)
-- Execute no SQL Editor do Supabase.

alter table public.config
  add column if not exists whatsapp_reminder_template text;

comment on column public.config.whatsapp_reminder_template is
  'Modelo da mensagem aberta no WhatsApp pelo botão da agenda. Placeholders: {nome}, {nomeCompleto}, {data}, {hora}, {servico}.';
