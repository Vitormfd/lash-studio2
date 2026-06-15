-- Porcentagem do lucro destinada ao salário/pró-labore (divisão salário vs empresa)
alter table public.config
  add column if not exists salary_percentage numeric(5, 2) default 50;

comment on column public.config.salary_percentage is
  'Percentual do lucro mensal destinado ao salário/pró-labore. O restante fica como dinheiro da empresa.';
