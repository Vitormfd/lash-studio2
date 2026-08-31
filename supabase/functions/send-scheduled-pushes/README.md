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

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (ex.: `mailto:suporte@seudominio.com`)
- `CRON_SECRET`

Variáveis com prefixo `SUPABASE_` são reservadas e já são fornecidas pela plataforma (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Não tente definir essas variáveis com `supabase secrets set`.

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

## Novo agendamento pelo link público

Quando `create_public_booking` grava o horário, a função recebe `mode = new_booking` e envia um push para **todos os aparelhos** da conta (dona e funcionárias que ativaram):

```bash
curl -X POST "https://<PROJECT-REF>.functions.supabase.co/send-scheduled-pushes" \
   -H "Content-Type: application/json" \
   -d '{"mode":"new_booking","appointment_id":"<UUID>"}'
```

Esse modo não usa `CRON_SECRET`. Ele só aceita um agendamento recente com `notes = 'Agendamento público'` e evita reenvio via `owner_notified_at`.

Rode `supabase/sql/public_booking_rpc.sql` e `supabase/sql/operator_notifications.sql` no SQL Editor.

## Funcionário ou dona agendou no app

Quando alguém cria um horário no app, o cliente chama `mode = staff_booking` com o JWT da conta:

- **Funcionária agenda** → push só nos aparelhos da dona
- **Dona agenda** → push nos aparelhos das funcionárias (perfis ativos ≠ dona)

```bash
curl -X POST "https://<PROJECT-REF>.functions.supabase.co/send-scheduled-pushes" \
   -H "Content-Type: application/json" \
   -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
   -d '{"mode":"staff_booking","appointment_id":"<UUID>","actor_operator_id":"<TEAM_MEMBER_UUID>"}'
```

Cada `push_subscriptions.operator_id` precisa estar preenchido: a pessoa ativa o lembrete (ou entra com o PIN) no próprio celular.

## Disparo de teste para todos os dispositivos inscritos

Para enviar uma notificacao manual para todas as subscriptions salvas, envie um body JSON com `mode = broadcast_test`:

```bash
curl -X POST "https://<PROJECT-REF>.functions.supabase.co/send-scheduled-pushes" \
   -H "Authorization: Bearer <CRON_SECRET>" \
   -H "Content-Type: application/json" \
   -d '{
      "mode": "broadcast_test",
      "title": "Teste de notificacao",
      "body": "Seu envio push esta funcionando neste dispositivo.",
      "url": "/"
   }'
```

Isso ignora os filtros de agendamento do dia e tenta enviar para todos os endpoints em `push_subscriptions`.

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
