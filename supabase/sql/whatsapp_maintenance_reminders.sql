-- Lembrete automático de manutenção pelo WhatsApp (Evolution API)
-- Execute no SQL Editor do Supabase depois de whatsapp_auto_reminders.sql.
-- Usa a mesma conexão e o mesmo cron (whatsapp-reminders-every-5m) do lembrete de atendimento.

alter table public.config
  add column if not exists whatsapp_maintenance_enabled boolean not null default false;

alter table public.config
  add column if not exists whatsapp_maintenance_template text;

comment on column public.config.whatsapp_maintenance_enabled is
  'Se true, a função whatsapp-reminders avisa a cliente quando a manutenção vence e ela não tem horário marcado.';
comment on column public.config.whatsapp_maintenance_template is
  'Mensagem do lembrete de manutenção. Vazia = mensagem padrão.';

alter table public.clients
  add column if not exists maintenance_reminder_for date;

alter table public.clients
  add column if not exists maintenance_reminder_sent_at timestamptz;

alter table public.clients
  add column if not exists maintenance_reminder_error text;

comment on column public.clients.maintenance_reminder_for is
  'Data do último atendimento concluído que já gerou lembrete de manutenção (um lembrete por visita).';
comment on column public.clients.maintenance_reminder_sent_at is
  'Quando o último lembrete automático de manutenção foi enviado.';
