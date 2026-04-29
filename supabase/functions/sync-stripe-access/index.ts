import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import Stripe from 'npm:stripe@17.7.0'

type ProfilePlan = 'active' | 'canceled'
type ProfileAccess = 'full' | 'demo'

const PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const resolvePlanFromStatus = (status: string): { plan: ProfilePlan; access: ProfileAccess } | null => {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active' || normalized === 'trialing' || normalized === 'past_due') {
    return { plan: 'active', access: 'full' }
  }
  if (normalized === 'canceled' || normalized === 'cancelled' || normalized === 'unpaid' || normalized === 'incomplete_expired') {
    return { plan: 'canceled', access: 'demo' }
  }
  return null
}

const toIso = (value: number | null | undefined) => {
  if (!value || !Number.isFinite(value)) return null
  return new Date(value * 1000).toISOString()
}

const pickBestSubscription = async (stripe: Stripe, email: string) => {
  const customers = await stripe.customers.list({ email, limit: 100 })
  if (!customers.data.length) return null

  let activeCandidate: { status: string; currentPeriodEnd: number | null } | null = null

  for (const customer of customers.data) {
    const subscriptions = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 100 })
    for (const subscription of subscriptions.data) {
      const mapped = resolvePlanFromStatus(subscription.status)
      if (!mapped) continue
      if (mapped.access !== 'full') continue

      const periodEnd = subscription.current_period_end ?? null
      if (!activeCandidate || (periodEnd || 0) > (activeCandidate.currentPeriodEnd || 0)) {
        activeCandidate = {
          status: subscription.status,
          currentPeriodEnd: periodEnd,
        }
      }
    }
  }

  return activeCandidate
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' })

  if (!PROJECT_URL || !SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
    return json(500, { ok: false, error: 'Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or STRIPE_SECRET_KEY' })
  }

  const authorization = req.headers.get('Authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return json(401, { ok: false, error: 'Missing bearer token' })

  const sb = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: authData, error: authError } = await sb.auth.getUser(token)
  if (authError || !authData?.user) {
    return json(401, { ok: false, error: 'Invalid or expired token' })
  }

  const user = authData.user
  const email = String(user.email || '').trim().toLowerCase()
  if (!email) {
    return json(400, { ok: false, error: 'Authenticated user has no email' })
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  const activeSubscription = await pickBestSubscription(stripe, email)

  if (!activeSubscription) {
    return json(200, { ok: true, synced: false, reason: 'No active subscription found for email' })
  }

  const mapped = resolvePlanFromStatus(activeSubscription.status)
  if (!mapped || mapped.access !== 'full') {
    return json(200, { ok: true, synced: false, reason: 'Subscription status is not eligible for full access' })
  }

  const expiresAt = toIso(activeSubscription.currentPeriodEnd)
  const { error } = await sb
    .from('profiles')
    .upsert(
      {
        id: user.id,
        plan: mapped.plan,
        access_level: mapped.access,
        subscription_expires_at: expiresAt,
      },
      { onConflict: 'id' },
    )

  if (error) {
    return json(500, { ok: false, error: error.message })
  }

  return json(200, {
    ok: true,
    synced: true,
    userId: user.id,
    email,
    plan: mapped.plan,
    access_level: mapped.access,
    subscription_expires_at: expiresAt,
  })
})