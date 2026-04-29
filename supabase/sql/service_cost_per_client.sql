-- Execute no Supabase SQL Editor para habilitar custo por servico.

alter table public.services
  add column if not exists cost_per_client numeric;

comment on column public.services.cost_per_client is
  'Custo variavel opcional por atendimento para este servico. Quando nulo, o sistema usa o custo padrao (config.avg_cost).';
