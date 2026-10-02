-- Execute no Supabase SQL Editor após a tabela services existir.
-- Duração padrão de cada serviço (usada no agendamento interno e no link público).

alter table public.services
  add column if not exists duration_minutes integer not null default 60;

comment on column public.services.duration_minutes is 'Duracao padrao do servico em minutos.';
