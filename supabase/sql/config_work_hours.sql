-- Horário de trabalho por dia da semana (agendamento público)
-- Execute no SQL Editor do Supabase, nesta ordem:
--   1) este arquivo (config_work_hours.sql)
--   2) public_booking_rpc.sql (atualiza as RPCs do link público)

alter table public.config
  add column if not exists work_hours jsonb
  default '{
    "mon": {"closed": false, "start": "08:00", "end": "18:00"},
    "tue": {"closed": false, "start": "08:00", "end": "18:00"},
    "wed": {"closed": false, "start": "08:00", "end": "18:00"},
    "thu": {"closed": false, "start": "08:00", "end": "18:00"},
    "fri": {"closed": false, "start": "08:00", "end": "18:00"},
    "sat": {"closed": false, "start": "08:00", "end": "14:00"},
    "sun": {"closed": true, "start": "08:00", "end": "18:00"}
  }'::jsonb;

comment on column public.config.work_hours is
  'Horário de trabalho por dia (mon–sun): { closed, start, end }. Usado no agendamento público.';

-- Atualiza quem ainda está com NULL
update public.config
set work_hours = '{
  "mon": {"closed": false, "start": "08:00", "end": "18:00"},
  "tue": {"closed": false, "start": "08:00", "end": "18:00"},
  "wed": {"closed": false, "start": "08:00", "end": "18:00"},
  "thu": {"closed": false, "start": "08:00", "end": "18:00"},
  "fri": {"closed": false, "start": "08:00", "end": "18:00"},
  "sat": {"closed": false, "start": "08:00", "end": "14:00"},
  "sun": {"closed": true, "start": "08:00", "end": "18:00"}
}'::jsonb
where work_hours is null;
