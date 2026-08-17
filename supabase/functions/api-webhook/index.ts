import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import Stripe from 'npm:stripe@17.7.0'

type WebhookPayload = {
  event?: string
  type?: string
  user_id?: string
  userId?: string
  email?: string
  expires_at?: string | null
  subscription_expires_at?: string | null
}

type ProfilePlan = 'active' | 'canceled'
type ProfileAccess = 'full' | 'demo'

type ProfileSnapshot = {
  plan: 'free' | ProfilePlan
  access_level: ProfileAccess
  manual_grant: boolean
  subscription_expires_at: string | null
} | null

const corsHeaders = {
  'Content-Type': 'application/json',
}

const PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const WEBHOOK_SECRET = Deno.env.get('PAYMENT_WEBHOOK_SECRET') || ''
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || ''
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || WEBHOOK_SECRET
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

const toIso = (value: unknown) => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString()
  }
  return null
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? value as Record<string, unknown> : null

const getFromRecord = (record: Record<string, unknown> | undefined | null, key: string) => {
  if (!record) return null
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const getId = (value: unknown) => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return getFromRecord(asRecord(value), 'id')
}

const collectEmails = (...objects: Array<Record<string, unknown> | null | undefined>) => {
  const emails = new Set<string>()
  const add = (value: string | null) => {
    if (!value || !value.includes('@')) return
    emails.add(value.trim().toLowerCase())
  }

  for (const object of objects) {
    if (!object) continue
    add(getFromRecord(object, 'customer_email'))
    add(getFromRecord(object, 'email'))
    add(getFromRecord(asRecord(object.customer_details), 'email'))
    add(getFromRecord(asRecord(object.customer), 'email'))
    add(getFromRecord(asRecord(object.prefilled), 'email'))
  }

  return [...emails]
}

const getStripeUserIdFromObject = (object: Record<string, unknown>) => {
  const metadata = asRecord(object.metadata)
  const subscriptionDetails = asRecord(object.subscription_details)
  const subscriptionMetadata = asRecord(subscriptionDetails?.metadata)

  return getFromRecord(metadata, 'user_id')
    || getFromRecord(subscriptionMetadata, 'user_id')
    || getFromRecord(object, 'client_reference_id')
}

const findUserIdByEmail = async (email: string) => {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  try {
    const response = await fetch(
      `${PROJECT_URL}/auth/v1/admin/users?email=${encodeURIComponent(normalized)}`,
      {
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
      },
    )
    if (!response.ok) return null
    const payload = await response.json()
    if (payload && typeof payload === 'object' && typeof payload.id === 'string') {
      return payload.id
    }
    const users = Array.isArray(payload?.users) ? payload.users : []
    const match = users.find((user: { email?: string; id?: string }) =>
      String(user.email || '').trim().toLowerCase() === normalized
    )
    return typeof match?.id === 'string' ? match.id : null
  } catch {
    return null
  }
}

const userIdExists = async (
  sb: ReturnType<typeof createClient>,
  userId: string,
) => {
  if (!UUID_RE.test(userId)) return false
  const { data, error } = await sb.auth.admin.getUserById(userId)
  return !error && Boolean(data?.user?.id)
}

const findRelatedCheckoutSession = async (
  stripe: Stripe,
  object: Record<string, unknown>,
) => {
  if (getFromRecord(object, 'object') === 'checkout.session' || getFromRecord(object, 'client_reference_id')) {
    return object
  }

  const subscriptionId = getId(object.subscription)
    || (getFromRecord(object, 'object') === 'subscription' ? getFromRecord(object, 'id') : null)

  if (subscriptionId) {
    const sessions = await stripe.checkout.sessions.list({ subscription: subscriptionId, limit: 5 })
    const match = sessions.data.find((session) => session.client_reference_id) || sessions.data[0]
    if (match) return match as unknown as Record<string, unknown>
  }

  const customerId = getId(object.customer)
  if (customerId) {
    const sessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 10 })
    const completed = sessions.data.filter((session) => session.status === 'complete')
    const match = completed.find((session) => session.client_reference_id) || completed[0]
    if (match) return match as unknown as Record<string, unknown>
  }

  return null
}

const retrieveCustomerEmail = async (stripe: Stripe, object: Record<string, unknown>) => {
  const customerId = getId(object.customer)
  if (!customerId) return null
  try {
    const customer = await stripe.customers.retrieve(customerId)
    if ('deleted' in customer && customer.deleted) return null
    return typeof customer.email === 'string' ? customer.email : null
  } catch {
    return null
  }
}

const updateProfileAccess = async (
  sb: ReturnType<typeof createClient>,
  userId: string,
  plan: ProfilePlan,
  accessLevel: ProfileAccess,
  expiresAt: string | null,
  options?: { clearManualGrant?: boolean },
) => {
  const row: Record<string, unknown> = {
    id: userId,
    plan,
    access_level: accessLevel,
    subscription_expires_at: expiresAt,
  }
  if (options?.clearManualGrant) {
    row.manual_grant = false
  }
  return sb
    .from('profiles')
    .upsert(row, { onConflict: 'id' })
}

const resolveUserIdFromStripe = async (
  sb: ReturnType<typeof createClient>,
  stripe: Stripe,
  object: Record<string, unknown>,
) => {
  const relatedSession = await findRelatedCheckoutSession(stripe, object).catch(() => null)
  const directId = getStripeUserIdFromObject(object)
    || (relatedSession ? getStripeUserIdFromObject(relatedSession) : null)

  if (directId && await userIdExists(sb, directId)) return directId

  const emails = collectEmails(object, relatedSession)
  const customerEmail = await retrieveCustomerEmail(stripe, object)
  if (customerEmail) emails.push(customerEmail.trim().toLowerCase())

  for (const email of [...new Set(emails)]) {
    const userId = await findUserIdByEmail(email)
    if (userId) return userId
  }

  return null
}

const attachUserIdToStripe = async (
  stripe: Stripe,
  object: Record<string, unknown>,
  userId: string,
) => {
  const subscriptionId = getId(object.subscription)
    || (getFromRecord(object, 'object') === 'subscription' ? getFromRecord(object, 'id') : null)
  const customerId = getId(object.customer)

  try {
    if (subscriptionId) {
      await stripe.subscriptions.update(subscriptionId, { metadata: { user_id: userId } })
    }
  } catch {}

  try {
    if (customerId) {
      await stripe.customers.update(customerId, { metadata: { user_id: userId } })
    }
  } catch {}
}

const mapStripeStatusToAccess = (status: string): { plan: ProfilePlan, access: ProfileAccess } | null => {
  const normalized = status.toLowerCase()
  if (normalized === 'active' || normalized === 'trialing' || normalized === 'past_due') {
    return { plan: 'active', access: 'full' }
  }
  if (normalized === 'canceled' || normalized === 'cancelled' || normalized === 'unpaid' || normalized === 'incomplete_expired') {
    return { plan: 'canceled', access: 'demo' }
  }
  return null
}

const getProfileSnapshot = async (
  sb: ReturnType<typeof createClient>,
  userId: string,
): Promise<ProfileSnapshot> => {
  const { data, error } = await sb
    .from('profiles')
    .select('plan, access_level, manual_grant, subscription_expires_at')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return null

  const plan = data.plan === 'active' || data.plan === 'canceled' ? data.plan : 'free'
  const access_level = data.access_level === 'full' ? 'full' : 'demo'
  return {
    plan,
    access_level,
    manual_grant: Boolean(data.manual_grant),
    subscription_expires_at: data.subscription_expires_at || null,
  }
}

// Manual grants must not be wiped by Stripe cancel/unpaid events.
// Patterns:
// - manual_grant = true (explicit lock)
// - legacy: plan free + access full
// - common admin pattern: active + full + no Stripe expiry date
const shouldProtectManualFullAccess = (
  currentProfile: ProfileSnapshot,
  nextPlan: ProfilePlan,
  nextAccess: ProfileAccess,
) => {
  if (nextPlan !== 'canceled' || nextAccess !== 'demo') return false
  if (!currentProfile) return false
  if (currentProfile.access_level !== 'full') return false
  if (currentProfile.manual_grant) return true
  if (currentProfile.plan === 'free') return true
  if (currentProfile.plan === 'active' && !currentProfile.subscription_expires_at) return true
  return false
}

const handleStripeWebhook = async (
  sb: ReturnType<typeof createClient>,
  rawBody: string,
  stripeSignature: string,
) => {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return json(500, { ok: false, error: 'Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET' })
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, stripeSignature, STRIPE_WEBHOOK_SECRET)
  } catch (error) {
    return json(401, {
      ok: false,
      error: 'Invalid Stripe signature',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }

  const object = event.data.object as Record<string, unknown>
  const userId = await resolveUserIdFromStripe(sb, stripe, object)
  if (!userId) {
    return json(404, { ok: false, error: 'User not found for Stripe event', event: event.type })
  }

  await attachUserIdToStripe(stripe, object, userId)

  if (
    event.type === 'checkout.session.completed'
    || event.type === 'invoice.payment_succeeded'
    || event.type === 'invoice.paid'
  ) {
    const { error } = await updateProfileAccess(sb, userId, 'active', 'full', null, { clearManualGrant: true })
    if (error) return json(500, { ok: false, error: error.message })
    return json(200, { ok: true, provider: 'stripe', event: event.type, userId, plan: 'active', access_level: 'full' })
  }

  if (event.type === 'invoice.payment_failed' || event.type === 'customer.subscription.deleted') {
    const currentProfile = await getProfileSnapshot(sb, userId)
    if (shouldProtectManualFullAccess(currentProfile, 'canceled', 'demo')) {
      return json(200, {
        ok: true,
        provider: 'stripe',
        event: event.type,
        userId,
        protected: true,
        reason: 'Manual full access profile was preserved',
      })
    }

    const expiresAt = toIso(object.current_period_end)
    const { error } = await updateProfileAccess(sb, userId, 'canceled', 'demo', expiresAt)
    if (error) return json(500, { ok: false, error: error.message })
    return json(200, { ok: true, provider: 'stripe', event: event.type, userId, plan: 'canceled', access_level: 'demo' })
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    const status = getFromRecord(object, 'status') || ''
    const mapped = mapStripeStatusToAccess(status)
    if (!mapped) {
      return json(200, { ok: true, ignored: true, provider: 'stripe', event: event.type, status })
    }

    const currentProfile = await getProfileSnapshot(sb, userId)
    if (shouldProtectManualFullAccess(currentProfile, mapped.plan, mapped.access)) {
      return json(200, {
        ok: true,
        provider: 'stripe',
        event: event.type,
        status,
        userId,
        protected: true,
        reason: 'Manual full access profile was preserved',
      })
    }

    const expiresAt = toIso(object.current_period_end)
    const clearManualGrant = mapped.plan === 'active' && mapped.access === 'full'
    const { error } = await updateProfileAccess(
      sb,
      userId,
      mapped.plan,
      mapped.access,
      expiresAt,
      clearManualGrant ? { clearManualGrant: true } : undefined,
    )
    if (error) return json(500, { ok: false, error: error.message })
    return json(200, {
      ok: true,
      provider: 'stripe',
      event: event.type,
      status,
      userId,
      plan: mapped.plan,
      access_level: mapped.access,
    })
  }

  return json(200, { ok: true, ignored: true, provider: 'stripe', event: event.type })
}

const resolveUserId = async (sb: ReturnType<typeof createClient>, payload: WebhookPayload) => {
  if (payload.user_id) return payload.user_id
  if (payload.userId) return payload.userId

  const email = payload.email?.trim().toLowerCase()
  if (!email) return null

  return findUserIdByEmail(email)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'POST only' })
  }

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'Missing Supabase env vars' })
  }

  const rawBody = await req.text()
  const stripeSignature = req.headers.get('stripe-signature') || ''

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

  if (stripeSignature) {
    return handleStripeWebhook(sb, rawBody, stripeSignature)
  }

  const signature = req.headers.get('x-webhook-signature') || ''
  if (!(await verifySignature(rawBody, signature))) {
    return json(401, { ok: false, error: 'Invalid signature' })
  }

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

  const currentProfile = await getProfileSnapshot(sb, userId)
  if (shouldProtectManualFullAccess(currentProfile, nextPlan, nextAccess)) {
    return json(200, {
      ok: true,
      event,
      userId,
      protected: true,
      reason: 'Manual full access profile was preserved',
    })
  }

  const { error } = await sb
    .from('profiles')
    .upsert(
      {
        id: userId,
        plan: nextPlan,
        access_level: nextAccess,
        subscription_expires_at: expiresAt,
        ...(nextPlan === 'active' && nextAccess === 'full' ? { manual_grant: false } : {}),
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
