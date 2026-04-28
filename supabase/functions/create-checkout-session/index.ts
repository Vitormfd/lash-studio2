import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import Stripe from 'npm:stripe@17.7.0'

type RequestBody = {
  priceId?: string
  successUrl?: string
  cancelUrl?: string
  userId?: string
  email?: string
}

const PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || ''
const DEFAULT_PRICE_ID = Deno.env.get('STRIPE_PRICE_ID') || ''
const APP_URL = Deno.env.get('APP_URL') || ''
const CORS_ORIGIN = Deno.env.get('CORS_ORIGIN') || '*'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers })

const parseBearerToken = (value: string | null) =>
  value?.replace(/^Bearer\s+/i, '').trim() || ''

const safeUrl = (value: string | undefined | null, fallback: string) => {
  if (typeof value !== 'string' || !value.trim()) return fallback
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback
    return url.toString()
  } catch {
    return fallback
  }
}

const withCheckoutState = (rawUrl: string, state: 'success' | 'canceled') => {
  try {
    const url = new URL(rawUrl)
    if (!url.searchParams.has('checkout')) {
      url.searchParams.set('checkout', state)
    }
    return url.toString()
  } catch {
    return rawUrl
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers })
  }

  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'POST only' })
  }

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'Missing Supabase env vars' })
  }

  if (!STRIPE_SECRET_KEY) {
    return json(500, { ok: false, error: 'Missing STRIPE_SECRET_KEY' })
  }

  const token = parseBearerToken(req.headers.get('Authorization'))
  if (!token) {
    return json(401, { ok: false, error: 'Missing bearer token' })
  }

  const sb = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: authData, error: authError } = await sb.auth.getUser(token)
  if (authError || !authData?.user) {
    return json(401, { ok: false, error: 'Invalid auth token' })
  }

  const user = authData.user

  let payload: RequestBody = {}
  try {
    payload = await req.json()
  } catch {
    payload = {}
  }

  if (payload.userId && payload.userId !== user.id) {
    return json(403, { ok: false, error: 'User mismatch' })
  }

  const appBaseUrl = APP_URL || `${new URL(req.url).protocol}//${new URL(req.url).host}`
  const successUrl = withCheckoutState(
    safeUrl(payload.successUrl, `${appBaseUrl}/`),
    'success',
  )
  const cancelUrl = withCheckoutState(
    safeUrl(payload.cancelUrl, `${appBaseUrl}/`),
    'canceled',
  )

  const priceId = (payload.priceId || DEFAULT_PRICE_ID || '').trim()
  if (!priceId) {
    return json(500, { ok: false, error: 'Missing Stripe price id (STRIPE_PRICE_ID)' })
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20',
  })

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email || payload.email || undefined,
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: user.id,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
        },
      },
    })

    if (!session.url) {
      return json(500, { ok: false, error: 'Stripe checkout session without URL' })
    }

    return json(200, {
      ok: true,
      sessionId: session.id,
      url: session.url,
    })
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Checkout creation failed',
    })
  }
})
