import { createContext, useContext } from 'react'
import { getClient, local } from './supabase'
import { DEFAULT_PROFESSIONAL_TYPE, normalizeProfessionalType } from './domain'

const FALLBACK_KEY = (userId) => `u_${userId}_access_profile`

export const normalizePlan = (value) => {
  if (value === 'active' || value === 'canceled' || value === 'trial') return value
  return 'free'
}

export const normalizeAccessLevel = (value) => {
  if (value === 'full') return 'full'
  return 'demo'
}

export const canUserEdit = (accessLevel) => normalizeAccessLevel(accessLevel) === 'full'

const isExpired = (expiresAt) => {
  if (!expiresAt) return false
  const t = new Date(expiresAt).getTime()
  return Number.isFinite(t) && t <= Date.now()
}

/** Mesma regra de public.is_full_access(): acesso completo vencido vira modo demonstração. */
export const effectiveAccessLevel = (profile) =>
  normalizeAccessLevel(profile?.accessLevel) === 'full' && !isExpired(profile?.subscriptionExpiresAt) ? 'full' : 'demo'

/** Dias restantes do teste grátis (arredonda para cima), ou null se não está em teste. */
export const trialDaysLeft = (profile) => {
  if (normalizePlan(profile?.plan) !== 'trial' || !profile?.subscriptionExpiresAt) return null
  const ms = new Date(profile.subscriptionExpiresAt).getTime() - Date.now()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.ceil(ms / 86400000))
}

/** Teste grátis que já acabou (para a mensagem do paywall). */
export const isTrialExpired = (profile) =>
  normalizePlan(profile?.plan) === 'trial' && isExpired(profile?.subscriptionExpiresAt)

export const defaultAccessProfile = {
  plan: 'free',
  accessLevel: 'demo',
  subscriptionExpiresAt: null,
  professionalType: DEFAULT_PROFESSIONAL_TYPE,
}

export const fetchUserAccessProfile = async (userId, isDemo) => {
  if (!userId) return defaultAccessProfile
  if (isDemo) return defaultAccessProfile

  const sb = getClient()
  if (sb) {
    const loadProfile = async () => sb
      .from('profiles')
      .select('plan, access_level, subscription_expires_at, professional_type')
      .eq('id', userId)
      .maybeSingle()

    let { data, error } = await loadProfile()
    if (error) {
      const retry = await loadProfile()
      data = retry.data
      error = retry.error
    }

    if (!error && data) {
      const normalized = {
        plan: normalizePlan(data.plan),
        accessLevel: normalizeAccessLevel(data.access_level),
        subscriptionExpiresAt: data.subscription_expires_at || null,
        professionalType: normalizeProfessionalType(data.professional_type),
      }
      local.set(FALLBACK_KEY(userId), normalized)
      return normalized
    }

    // Profile genuinely doesn't exist in DB (no error, no row) → create with defaults.
    // ignoreDuplicates avoids overwriting a concurrent/manual active grant.
    if (!error && !data) {
      await sb.from('profiles').upsert({
        id: userId,
        plan: 'free',
        access_level: 'demo',
        professional_type: DEFAULT_PROFESSIONAL_TYPE,
      }, { onConflict: 'id', ignoreDuplicates: true })
      local.set(FALLBACK_KEY(userId), defaultAccessProfile)
      return defaultAccessProfile
    }

    // Network/auth error → fall through to localStorage cache below
  }

  const stored = local.get(FALLBACK_KEY(userId))
  if (!stored) {
    local.set(FALLBACK_KEY(userId), defaultAccessProfile)
    return defaultAccessProfile
  }

  return {
    plan: normalizePlan(stored.plan),
    accessLevel: normalizeAccessLevel(stored.accessLevel || stored.access_level),
    subscriptionExpiresAt: stored.subscriptionExpiresAt || stored.subscription_expires_at || null,
    professionalType: normalizeProfessionalType(stored.professionalType || stored.professional_type),
  }
}

export const AccessContext = createContext({
  ...defaultAccessProfile,
  canUserEdit: false,
  checkoutUrl: '',
  openPaywall: () => {},
})

export const AccessProvider = AccessContext.Provider

export const useAccess = () => useContext(AccessContext)
