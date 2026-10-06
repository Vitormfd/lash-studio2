# Lembrete automático no WhatsApp (Evolution API)

Cada conta conecta o próprio WhatsApp por QR Code em **Configurações → Lembrete automático no WhatsApp**.
A função cria uma instância na Evolution API chamada `easystudio_<user_id sem hífens>` e, a cada 5 minutos,
envia o lembrete (mesmo modelo de "Mensagem do WhatsApp") para as clientes com atendimento pendente/confirmado.

## Segredos (Project Settings → Edge Functions → Secrets)

- `EVOLUTION_API_URL` — URL pública da Evolution na VPS, com HTTPS (ex.: `https://evo.seudominio.com.br`)
- `EVOLUTION_API_KEY` — a `AUTHENTICATION_API_KEY` global da Evolution
- `CRON_SECRET` — o mesmo já usado em `send-scheduled-pushes`
- `EVOLUTION_INSTANCE_PREFIX` (opcional, padrão `easystudio`)

```bash
supabase secrets set EVOLUTION_API_URL=https://evo.seudominio.com.br EVOLUTION_API_KEY=xxxx
```

## Deploy

```bash
supabase functions deploy whatsapp-reminders --no-verify-jwt
```

Depois rode `supabase/sql/whatsapp_auto_reminders.sql` no SQL Editor (troque `<SUA_CRON_SECRET>`).

## Ações

| action           | Auth                     | O que faz |
|------------------|--------------------------|-----------|
| `status`         | JWT da conta             | estado da conexão e número conectado |
| `connect`        | JWT da conta             | cria a instância (se preciso) e devolve o QR Code |
| `disconnect`     | JWT da conta             | desconecta, apaga a instância e desliga os lembretes |
| `test`           | JWT da conta             | envia `text` para `number` |
| `send_reminders` | `Bearer <CRON_SECRET>`   | envia os lembretes que estão na hora |

Teste manual do cron:

```bash
curl -X POST "https://mbxfswxjrdikdyzpukmw.supabase.co/functions/v1/whatsapp-reminders" \
  -H "Authorization: Bearer <CRON_SECRET>" -H "Content-Type: application/json" \
  -d '{"action":"send_reminders"}'
```

## Regras de envio

- Envia quando falta no máximo a antecedência escolhida e no mínimo 15 min para o atendimento.
- Cada agendamento recebe um lembrete só (`appointments.whatsapp_reminder_sent_at`); remarcar data/hora libera um novo.
- Se o WhatsApp estiver desconectado, não marca como enviado e tenta de novo no próximo ciclo.
- Falhas ficam em `appointments.whatsapp_reminder_error`.
- Até 60 mensagens por ciclo, com 1,2 s entre elas, para não parecer spam ao WhatsApp.

## Lembrete de manutenção

Ligado em **Configurações → Lembrete automático no WhatsApp → Lembrete de manutenção**
(`config.whatsapp_maintenance_enabled`). Precisa de `supabase/sql/whatsapp_maintenance_reminders.sql`.
Roda no mesmo cron, depois dos lembretes de atendimento, com o que sobrar das 60 mensagens.

- Prazo de retorno = média entre visitas concluídas da cliente (2+ visitas), senão o padrão da profissão
  (lash/nail/barbeiro 21 dias, sobrancelha/estética 30). Mesma regra de `src/lib/clientInsights.js`.
- Envia do dia do vencimento até 7 dias depois, só entre 9h e 19h (BRT), se a cliente não tiver horário futuro.
- Uma mensagem por visita (`clients.maintenance_reminder_for` = data do último atendimento concluído).
- Falhas ficam em `clients.maintenance_reminder_error`.
