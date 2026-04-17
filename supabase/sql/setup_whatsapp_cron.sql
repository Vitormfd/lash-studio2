-- Configuracao do cron para envio de lembretes WhatsApp a cada 5 minutos.
--
-- Pre-requisitos:
-- 1) Extensoes pg_cron e pg_net habilitadas.
-- 2) Funcao deployada:
--    supabase functions deploy send-whatsapp-reminders --no-verify-jwt
-- 3) Segredos configurados em Edge Functions Secrets:
--    CRON_SECRET, WHATSAPP_API_KEY, WHATSAPP_NUMBER
--
-- Substitua placeholders:
--   <PROJECT-REF> e <CRON_SECRET>

select cron.schedule(
  'send-whatsapp-reminders-every-5m',
  '*/5 * * * *',
  $$
  select
    net.http_post(
      url := 'https://<PROJECT-REF>.supabase.co/functions/v1/send-whatsapp-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <CRON_SECRET>'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Conferir jobs
-- select * from cron.job;

-- Remover job
-- select cron.unschedule('send-whatsapp-reminders-every-5m');
