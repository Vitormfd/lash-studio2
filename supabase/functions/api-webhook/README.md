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
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Opcional (legado):

- `PAYMENT_WEBHOOK_SECRET`

## Assinatura do webhook

### Stripe (principal)

A funcao valida o header:

- `stripe-signature`

com `STRIPE_WEBHOOK_SECRET`.

### Gateway legado (compatibilidade)

A função valida o header:

- `x-webhook-signature`

Esperado: `hex(hmac_sha256(rawBody, PAYMENT_WEBHOOK_SECRET))`.

## Eventos suportados

Stripe aprovado/libera:

- `checkout.session.completed`
- `invoice.payment_succeeded`
- `customer.subscription.created`
- `customer.subscription.updated` (status `active`, `trialing`, `past_due`)

Stripe cancelado/bloqueia:

- `customer.subscription.deleted`
- `invoice.payment_failed`
- `customer.subscription.updated` (status `canceled`, `unpaid`, `incomplete_expired`)

Legado (mantido):

- `payment.approved`, `checkout.completed`, `invoice.paid`, `subscription.active`
- `subscription.canceled`, `subscription.cancelled`, `invoice.payment_failed`

## Atualizacao no Supabase

Tabela: `public.profiles`

- pagamento aprovado: `plan = active`, `access_level = full`, `manual_grant = false`
- cancelamento/expiracao: `plan = canceled`, `access_level = demo`
- se `manual_grant = true` (ou padrao legado de acesso manual), eventos de cancelamento **nao** rebaixam o perfil

Para liberar acesso manual (sem Stripe), rode no SQL Editor:

```sql
update public.profiles
set plan = 'active', access_level = 'full', manual_grant = true, subscription_expires_at = null
where id = '<user-uuid>';
```

Ver tambem: `supabase/sql/manual_grant_access.sql`.

## Deploy

```bash
supabase functions deploy api-webhook --no-verify-jwt
```
