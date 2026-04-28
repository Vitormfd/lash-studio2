# Create Checkout Session (Stripe)

Edge Function para criar sessao de assinatura no Stripe vinculada ao usuario logado.

## Endpoint

Depois do deploy:

- `https://<PROJECT-REF>.functions.supabase.co/create-checkout-session`

## Variaveis de ambiente

Defina no Supabase:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`

Opcional:

- `APP_URL` (fallback para success/cancel URLs)
- `CORS_ORIGIN` (default `*`)

## Requisicao

Metodo: `POST`

Headers:

- `Authorization: Bearer <supabase_access_token>`
- `Content-Type: application/json`

Body (opcional):

```json
{
  "priceId": "price_...",
  "successUrl": "https://seu-dominio.com/?checkout=success",
  "cancelUrl": "https://seu-dominio.com/?checkout=canceled"
}
```

A funcao injeta automaticamente `metadata.user_id` e `subscription_data.metadata.user_id` para o webhook conseguir liberar acesso.

## Resposta

```json
{
  "ok": true,
  "sessionId": "cs_...",
  "url": "https://checkout.stripe.com/c/pay/cs_..."
}
```

## Deploy

```bash
supabase functions deploy create-checkout-session --no-verify-jwt
```

`--no-verify-jwt` e necessario porque a funcao valida o bearer token manualmente e aplica CORS.
