-- Localização do estúdio/profissional (feriados estaduais e municipais na agenda)
alter table public.config
  add column if not exists state_uf text,
  add column if not exists city text;

comment on column public.config.state_uf is
  'UF do local de atendimento (ex.: SP). Usado para feriados estaduais na agenda.';

comment on column public.config.city is
  'Cidade do local de atendimento. Usado para feriados municipais conhecidos na agenda.';
