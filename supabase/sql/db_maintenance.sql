-- Manutenção do banco (05/11/2026)
-- Pode rodar mais de uma vez sem efeito colateral.

-- 1) Índices por conta. O app sempre busca clientes e agendamentos de uma conta
--    (user_id) em ordem; sem índice, o banco lê a tabela inteira a cada consulta.
create index if not exists clients_user_id_name_idx
  on public.clients (user_id, name);

create index if not exists appointments_user_id_date_idx
  on public.appointments (user_id, date, time);

-- 2) Histórico do pg_cron. Os lembretes de WhatsApp e as notificações rodam a cada
--    5 minutos e cada execução fica registrada para sempre em cron.job_run_details
--    (cerca de 76 mil linhas e 67 MB em 05/11/2026). Mantém só os últimos 7 dias,
--    o suficiente para investigar um problema, e agenda a mesma limpeza todo dia.
delete from cron.job_run_details
where start_time < now() - interval '7 days';

select cron.schedule(
  'limpar-historico-cron-diario',
  '17 6 * * *', -- 03:17 no horário de Brasília (o pg_cron usa UTC)
  $$delete from cron.job_run_details where start_time < now() - interval '7 days'$$
);
