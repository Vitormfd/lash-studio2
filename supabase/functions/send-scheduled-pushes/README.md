# Envio de pushes agendados (Supabase Edge Functions)

Este diretório documenta o **próximo passo** para notificações com o app fechado:

1. **Segredos no Supabase** (Project Settings → Edge Functions → Secrets):
   - `VAPID_PUBLIC_KEY` — mesmo valor de `VITE_VAPID_PUBLIC_KEY` no front
   - `VAPID_PRIVATE_KEY` — chave privada (nunca no cliente)
   - `VAPID_SUBJECT` — ex.: `mailto:suporte@seudominio.com`
   - `CRON_SECRET` — string forte; o cron envia `Authorization: Bearer <CRON_SECRET>`

2. **Gerar par VAPID** (na sua máquina):

   ```bash
   npx web-push generate-vapid-keys
   ```

   Copie a **public** para `VITE_VAPID_PUBLIC_KEY` no `.env` do app e a **private** para o segredo da função.

3. **Deploy da função** (quando implementar o `index.ts` completo):

   ```bash
   supabase functions deploy send-scheduled-pushes --no-verify-jwt
   ```

4. **Agendamento**: use [pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron) ou o agendador da Vercel/cron externo chamando a URL da função com `CRON_SECRET`.

A função deve:
- validar `CRON_SECRET`;
- listar `push_subscriptions` (com **service role**);
- para cada `user_id`, buscar agendamentos do dia (`appointments`);
- enviar payloads JSON via biblioteca `web-push` (corpo alinhado com `src/lib/dayMessages.js`).

O **service worker** já exibe `push` com `event.data.json()` (`title`, `body`, `tag`).
