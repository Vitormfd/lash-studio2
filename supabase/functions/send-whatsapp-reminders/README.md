# send-whatsapp-reminders

Edge Function para envio automatico de lembretes de agendamento via WhatsApp.

## Abordagem de cron usada

- `pg_cron` (a cada 5 min) + `pg_net` para chamar a Edge Function por HTTP.
- A funcao valida `CRON_SECRET` e executa com `SUPABASE_SERVICE_ROLE_KEY`.

## Janela de envio

- Busca agendamentos com inicio entre **55 e 65 minutos** no futuro.
- Ignora `status` fora de `pending` e `confirmed`.
- Ignora agendamentos com `reminder_sent = true`.

## Duplicidade

A funcao faz um "claim" por agendamento antes do envio e, em sucesso, atualiza:

- `appointments.reminder_sent = true`
- `appointments.reminder_sent_at = now()` (quando existir)
- `appointments.notification_status = sent` (quando existir)

## Variaveis de ambiente

Obrigatorias:

- `CRON_SECRET`
- `WHATSAPP_NUMBER`
- `WHATSAPP_API_KEY` (obrigatoria quando provider != mock)

Opcionais:

- `WHATSAPP_PROVIDER`: `mock` (default), `twilio`, `waba`
- `WHATSAPP_API_URL`: endpoint custom para provider real

## Numero remetente por profissional

- A funcao busca `public.config.professional_whatsapp` para cada `user_id`.
- Se o valor estiver em formato E.164, usa esse numero como remetente daquele profissional.
- Se nao houver numero valido no `config`, usa fallback global `WHATSAPP_NUMBER`.
- Se nenhum dos dois estiver valido, o envio daquele agendamento falha e entra em log.

As variaveis abaixo sao injetadas pelo Supabase automaticamente:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deploy

```bash
supabase functions deploy send-whatsapp-reminders --no-verify-jwt
```

## Teste manual

```bash
curl -X POST "https://<PROJECT-REF>.supabase.co/functions/v1/send-whatsapp-reminders" \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

## Integracao real

A logica de envio esta isolada em `sendWhatsAppMessage(phone, message)` no `index.ts`.

Para producao:

1. definir `WHATSAPP_PROVIDER=twilio` ou `WHATSAPP_PROVIDER=waba`;
2. configurar `WHATSAPP_API_KEY` e `WHATSAPP_API_URL`;
3. manter o mesmo fluxo de negocio sem alterar `checkUpcomingAppointments()`.
