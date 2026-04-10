-- Execute no Supabase SQL Editor após a tabela appointments existir.
-- Campos para lembretes futuros (WhatsApp etc.) — o app já grava estes valores.

alter table public.appointments
  add column if not exists reminder_enabled boolean not null default false;

alter table public.appointments
  add column if not exists reminder_minutes_before integer not null default 60;

comment on column public.appointments.reminder_enabled is 'Se true, o job de lembrete pode disparar para este agendamento.';
comment on column public.appointments.reminder_minutes_before is 'Antecedência do lembrete em minutos (ex.: 60 = 1h antes).';
