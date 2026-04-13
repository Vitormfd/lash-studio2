# Envio de pushes agendados (Supabase Edge Functions)

Esta função já está implementada em `index.ts` para enviar lembretes com o app fechado.

## O que a função faz

1. valida `CRON_SECRET` no header `Authorization: Bearer <CRON_SECRET>`;
2. lê `push_subscriptions` com `SUPABASE_SERVICE_ROLE_KEY`;
3. busca agendamentos de hoje (`appointments`) com lembrete ativo e ainda não enviados;
4. dispara Web Push via VAPID;
5. marca `reminder_sent_at` e `notification_status = 'sent'` quando houver sucesso;
6. remove endpoints inválidos (status 404/410).

## Segredos obrigatórios

Em Supabase Project Settings -> Edge Functions -> Secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (ex.: `mailto:suporte@seudominio.com`)
- `CRON_SECRET`

No frontend, `VITE_VAPID_PUBLIC_KEY` deve ter o mesmo valor de `VAPID_PUBLIC_KEY`.

## Gerar chaves VAPID

```bash
npx web-push generate-vapid-keys
```

## Deploy

```bash
supabase functions deploy send-scheduled-pushes --no-verify-jwt
```

## Teste manual da função

```bash
curl -X POST "https://<PROJECT-REF>.functions.supabase.co/send-scheduled-pushes" \
   -H "Authorization: Bearer <CRON_SECRET>"
```

Resposta esperada: JSON com `sent`, `failed`, `staleSubscriptionsRemoved` e `remindersMarkedSent`.

## Agendamento (a cada 5 minutos)

Exemplo com `pg_cron` chamando a Edge Function:

```sql
select cron.schedule(
   'send-scheduled-pushes-every-5m',
   '*/5 * * * *',
   $$
   select
      net.http_post(
         url := 'https://<PROJECT-REF>.functions.supabase.co/send-scheduled-pushes',
         headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
      );
   $$
);
```

Se preferir, use cron externo (Vercel Cron, GitHub Actions, etc.) fazendo POST para a mesma URL.
