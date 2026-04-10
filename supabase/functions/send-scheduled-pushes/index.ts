/**
 * Esqueleto para envio em massa via Web Push (VAPID).
 * Complete com @supabase/supabase-js (service role) e web-push.
 *
 * Deploy: supabase functions deploy send-scheduled-pushes --no-verify-jwt
 * Invocar com header: Authorization: Bearer <CRON_SECRET>
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const secret = Deno.env.get('CRON_SECRET')
  const auth = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret || auth !== secret) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: 'Stub: implementar envio com service role + web-push. Ver README na mesma pasta.',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
