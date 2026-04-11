# API Webhook (Pagamento)

Edge Function para eventos do gateway de pagamento.

## Endpoint

Depois do deploy:

- `https://<PROJECT-REF>.functions.supabase.co/api-webhook`

Se quiser o path `/api/webhook` no seu dominio principal, configure um rewrite no provedor de hospedagem para este endpoint.

## Variaveis de ambiente

Defina no Supabase:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYMENT_WEBHOOK_SECRET`

## Assinatura do webhook

A função valida o header:

- `x-webhook-signature`

Esperado: `hex(hmac_sha256(rawBody, PAYMENT_WEBHOOK_SECRET))`

## Eventos suportados

Aprovado (libera):

- `payment.approved`
- `checkout.completed`
- `invoice.paid`
- `subscription.active`

Cancelado/expirado (bloqueia):

- `subscription.canceled`
- `subscription.cancelled`
- `invoice.payment_failed`

## Atualizacao no Supabase

Tabela: `public.profiles`

- pagamento aprovado: `plan = active`, `access_level = full`
- cancelamento/expiracao: `plan = canceled`, `access_level = demo`

## Deploy

```bash
supabase functions deploy api-webhook --no-verify-jwt
```
