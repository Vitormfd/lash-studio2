import { createClient } from 'npm:@supabase/supabase-js@2.49.8'

type WebhookPayload = {
  event?: string
  type?: string
  user_id?: string
  userId?: string
  email?: string
  expires_at?: string | null
  subscription_expires_at?: string | null
}

const corsHeaders = {
  'Content-Type': 'application/json',
}

const PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const WEBHOOK_SECRET = Deno.env.get('PAYMENT_WEBHOOK_SECRET') || ''

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

const verifySignature = async (rawBody: string, signatureHeader: string) => {
  if (!WEBHOOK_SECRET) return false
  if (!signatureHeader) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = toHex(signed)
  return expected === signatureHeader.trim().toLowerCase()
}

const resolveUserId = async (sb: ReturnType<typeof createClient>, payload: WebhookPayload) => {
  if (payload.user_id) return payload.user_id
  if (payload.userId) return payload.userId

  const email = payload.email?.trim().toLowerCase()
  if (!email) return null

  const { data, error } = await sb
    .schema('auth')
    .from('users')
    .select('id')
    .eq('email', email)
    .limit(1)
    .maybeSingle()

  if (error || !data?.id) return null
  return data.id as string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'POST only' })
  }

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'Missing Supabase env vars' })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('x-webhook-signature') || ''

  if (!(await verifySignature(rawBody, signature))) {
    return json(401, { ok: false, error: 'Invalid signature' })
  }

  let payload: WebhookPayload = {}
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' })
  }

  const event = (payload.event || payload.type || '').toLowerCase()
  if (!event) {
    return json(400, { ok: false, error: 'Missing event type' })
  }

  const sb = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const userId = await resolveUserId(sb, payload)
  if (!userId) {
    return json(404, { ok: false, error: 'User not found' })
  }

  const approvedEvents = new Set([
    'payment.approved',
    'checkout.completed',
    'invoice.paid',
    'subscription.active',
  ])
  const canceledEvents = new Set([
    'subscription.canceled',
    'subscription.cancelled',
    'invoice.payment_failed',
  ])

  let nextPlan: 'active' | 'canceled'
  let nextAccess: 'full' | 'demo'

  if (approvedEvents.has(event)) {
    nextPlan = 'active'
    nextAccess = 'full'
  } else if (canceledEvents.has(event)) {
    nextPlan = 'canceled'
    nextAccess = 'demo'
  } else {
    return json(200, { ok: true, ignored: true, event })
  }

  const expiresAt = payload.subscription_expires_at || payload.expires_at || null

  const { error } = await sb
    .from('profiles')
    .upsert(
      {
        id: userId,
        plan: nextPlan,
        access_level: nextAccess,
        subscription_expires_at: expiresAt,
      },
      { onConflict: 'id' },
    )

  if (error) {
    return json(500, { ok: false, error: error.message })
  }

  return json(200, {
    ok: true,
    event,
    userId,
    plan: nextPlan,
    access_level: nextAccess,
  })
})
