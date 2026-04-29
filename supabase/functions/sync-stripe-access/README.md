# Sync Stripe Access

Edge Function para sincronizar acesso por email no Stripe apos login/signup.

## Quando usar

Resolve o caso em que a pessoa assina primeiro no checkout e so depois cria a conta.

## Endpoint

- `https://<PROJECT-REF>.functions.supabase.co/sync-stripe-access`

## Variaveis de ambiente (Supabase Functions)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`

## Seguranca

Requer header:

- `Authorization: Bearer <supabase_access_token>`

A funcao valida o token, pega o email do usuario autenticado e procura assinatura ativa no Stripe para esse email.

## Resultado

- Se encontrar assinatura ativa/trialing/past_due: atualiza `public.profiles` com `plan=active` e `access_level=full`.
- Se nao encontrar: retorna `synced=false` sem alterar acesso.

## Deploy

```bash
supabase functions deploy sync-stripe-access --no-verify-jwt
```

## Frontend (opcional)

No app, pode sobrescrever o nome da funcao via env:

- `VITE_STRIPE_SYNC_FUNCTION=sync-stripe-access`