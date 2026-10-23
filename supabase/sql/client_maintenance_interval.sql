-- Período de manutenção por cliente (aba Manutenção em Clientes)
-- Vazio = usa o padrão da profissão (21 dias para lash).
-- Execute depois de whatsapp_maintenance_reminders.sql.

alter table public.clients
  add column if not exists maintenance_interval_days integer;

alter table public.clients
  drop constraint if exists clients_maintenance_interval_days_check;

alter table public.clients
  add constraint clients_maintenance_interval_days_check
  check (maintenance_interval_days is null or maintenance_interval_days between 7 and 120);

comment on column public.clients.maintenance_interval_days is
  'Dias entre manutenções desta cliente. Null = padrão da profissão.';

notify pgrst, 'reload schema';
