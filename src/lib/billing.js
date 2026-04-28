import { getClient, getSupabaseConfig } from './supabase'

const RAW_CHECKOUT_URL = (import.meta.env.VITE_CHECKOUT_URL || '').trim()
const CHECKOUT_FUNCTION = (import.meta.env.VITE_STRIPE_CHECKOUT_FUNCTION || 'create-checkout-session').trim()
const EXPLICIT_FUNCTIONS_URL = (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL || '').trim().replace(/\/$/, '')

export const CHECKOUT_URL = RAW_CHECKOUT_URL || 'dynamic-checkout'

const isHttpUrl = (value) => /^https?:\/\//i.test(value || '')

const getHostedCheckoutUrl = () => {
  if (!isHttpUrl(RAW_CHECKOUT_URL)) return ''
  if (RAW_CHECKOUT_URL.includes('REPLACE_ME')) return ''
  return RAW_CHECKOUT_URL
}

const getFunctionsBaseUrl = () => {
  if (EXPLICIT_FUNCTIONS_URL) return EXPLICIT_FUNCTIONS_URL
  const { url } = getSupabaseConfig()
  if (!url || typeof url !== 'string') return ''
  return url.replace('.supabase.co', '.functions.supabase.co')
}

const withCheckoutState = (urlString, state) => {
  try {
    const url = new URL(urlString)
    if (!url.searchParams.has('checkout')) {
      url.searchParams.set('checkout', state)
    }
    return url.toString()
  } catch {
    return urlString
  }
}

const redirectTo = (url) => {
  window.location.assign(url)
}

export const openCheckout = async ({ userId, email } = {}) => {
  if (typeof window === 'undefined') return { ok: false }

  const hostedUrl = getHostedCheckoutUrl()
  if (hostedUrl) {
    try {
      const url = new URL(hostedUrl)
      if (email && typeof email === 'string' && email.trim()) {
        url.searchParams.set('prefilled_email', email.trim().toLowerCase())
      }
      if (userId && typeof userId === 'string' && userId.trim()) {
        url.searchParams.set('client_reference_id', userId.trim())
      }
      redirectTo(url.toString())
      return { ok: true, mode: 'payment_link', url: url.toString() }
    } catch {
      redirectTo(hostedUrl)
      return { ok: true, mode: 'payment_link', url: hostedUrl }
    }
  }

  const sb = getClient()
  if (!sb) {
    throw new Error('Supabase indisponivel para iniciar checkout.')
  }

  const { data, error } = await sb.auth.getSession()
  if (error || !data?.session?.access_token) {
    throw new Error('Sessao invalida. Faca login novamente para assinar.')
  }

  const baseUrl = getFunctionsBaseUrl()
  if (!baseUrl) {
    throw new Error('URL das Edge Functions nao configurada.')
  }

  const successUrl = withCheckoutState(`${window.location.origin}${window.location.pathname}`, 'success')
  const cancelUrl = withCheckoutState(`${window.location.origin}${window.location.pathname}`, 'canceled')

  const response = await fetch(`${baseUrl}/${CHECKOUT_FUNCTION}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({
      userId,
      email,
      successUrl,
      cancelUrl,
    }),
  })

  let payload = {}
  try {
    payload = await response.json()
  } catch {}

  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : 'Nao foi possivel iniciar o checkout.'
    throw new Error(message)
  }

  const checkoutUrl = typeof payload?.url === 'string' ? payload.url : ''
  if (!isHttpUrl(checkoutUrl)) {
    throw new Error('Checkout retornou URL invalida.')
  }

  redirectTo(checkoutUrl)
  return { ok: true, mode: 'checkout_session', url: checkoutUrl }
}
