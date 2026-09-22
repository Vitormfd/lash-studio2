-- Execute no Supabase SQL Editor após a tabela appointments existir.
-- Liga os agendamentos gerados automaticamente para um cliente fixo (barbeiro).

alter table public.appointments
  add column if not exists recurrence_id uuid;

alter table public.appointments
  add column if not exists recurrence_frequency text;

comment on column public.appointments.recurrence_id is 'Agrupa os agendamentos gerados para o mesmo cliente fixo.';
comment on column public.appointments.recurrence_frequency is 'Frequencia da serie: weekly | biweekly | monthly.';
