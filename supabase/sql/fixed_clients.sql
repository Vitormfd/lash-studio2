-- Execute no Supabase SQL Editor após a tabela clients existir.
-- Suporte a "cliente fixo" (barbeiro): marca um cliente com uma frequência de retorno.

alter table public.clients
  add column if not exists is_fixed boolean not null default false;

alter table public.clients
  add column if not exists fixed_frequency text;

alter table public.clients
  add column if not exists fixed_weekday smallint;

alter table public.clients
  add column if not exists fixed_time time;

comment on column public.clients.is_fixed is 'Cliente fixo: vem sempre no mesmo dia/horario, numa frequencia regular.';
comment on column public.clients.fixed_frequency is 'Frequencia do cliente fixo: weekly | biweekly | monthly.';
comment on column public.clients.fixed_weekday is 'Dia da semana preferido do cliente fixo (0=domingo .. 6=sabado).';
comment on column public.clients.fixed_time is 'Horario preferido do cliente fixo.';
