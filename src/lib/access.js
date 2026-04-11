import { createContext, useContext } from 'react'
import { getClient, local } from './supabase'

const FALLBACK_KEY = (userId) => `u_${userId}_access_profile`

export const normalizePlan = (value) => {
  if (value === 'active' || value === 'canceled') return value
  return 'free'
}

export const normalizeAccessLevel = (value) => {
  if (value === 'full') return 'full'
  return 'demo'
}

export const canUserEdit = (accessLevel) => normalizeAccessLevel(accessLevel) === 'full'

export const defaultAccessProfile = {
  plan: 'free',
  accessLevel: 'demo',
  subscriptionExpiresAt: null,
}

export const fetchUserAccessProfile = async (userId, isDemo) => {
  if (!userId) return defaultAccessProfile
  if (isDemo) return defaultAccessProfile

  const sb = getClient()
  if (sb) {
    const { data, error } = await sb
      .from('profiles')
      .select('plan, access_level, subscription_expires_at')
      .eq('id', userId)
      .maybeSingle()

    if (!error && data) {
      return {
        plan: normalizePlan(data.plan),
        accessLevel: normalizeAccessLevel(data.access_level),
        subscriptionExpiresAt: data.subscription_expires_at || null,
      }
    }

    if (!data) {
      await sb.from('profiles').upsert({ id: userId, plan: 'free', access_level: 'demo' }, { onConflict: 'id' })
      return defaultAccessProfile
    }
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
