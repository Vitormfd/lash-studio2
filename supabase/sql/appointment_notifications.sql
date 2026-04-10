-- Execute no Supabase SQL Editor após a tabela appointments existir.
-- Estrutura para lembretes / notificações futuras (sem integração externa ainda).

alter table public.appointments
  add column if not exists notification_status text not null default 'none';

alter table public.appointments
  add column if not exists reminder_sent_at timestamptz null;

comment on column public.appointments.notification_status is 'none | pending | sent | failed — uso futuro para fila de envio.';
comment on column public.appointments.reminder_sent_at is 'Quando o lembrete foi registrado como enviado (job futuro).';
