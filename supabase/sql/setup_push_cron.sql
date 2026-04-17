-- ─── Configuração do cron para envio de push a cada 5 minutos ─────────────────
--
-- Pré-requisitos:
--   1. Extensions pg_cron e pg_net habilitadas no Supabase Dashboard
--      (Settings → Database → Extensions → habilitar pg_cron e pg_net)
--
--   2. Segredos configurados em Project Settings → Edge Functions → Secrets:
--      VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
--
--   3. Deploy da função feito:
--      supabase functions deploy send-scheduled-pushes --no-verify-jwt
--
-- Substitua os placeholders antes de executar:
--   <PROJECT-REF>  → seu ref do Supabase (ex: mbxfswxjrdikdyzpukmw)
--   <CRON_SECRET>  → o mesmo valor do segredo CRON_SECRET cadastrado
-- ─────────────────────────────────────────────────────────────────────────────

-- Substitua SUA_CRON_SECRET pelo valor exato do segredo CRON_SECRET cadastrado
-- em Project Settings → Edge Functions → Secrets.
select cron.schedule(
  'send-scheduled-pushes-every-5m',
  '*/5 * * * *',
  $$
  select
    net.http_post(
      url    := 'https://mbxfswxjrdikdyzpukmw.supabase.co/functions/v1/send-scheduled-pushes',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <SUA_CRON_SECRET>'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Para checar se o cron foi criado:
-- select * from cron.job;

-- Para remover o cron (caso precise recriar):
-- select cron.unschedule('send-scheduled-pushes-every-5m');
