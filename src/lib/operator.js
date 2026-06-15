import { createContext, useContext } from 'react'

export const OPERATOR_INACTIVITY_MS = 20 * 60 * 1000

const OPERATOR_SESSION_KEY = 'lash_active_operator'
const OPERATOR_ACTIVITY_KEY = 'lash_operator_last_activity'

const MEMBER_COLORS = ['#C17B82', '#9B8FB8', '#7BAF9A', '#D4A574', '#6B9AC4', '#B5838D']

let _activeOperator = null

export const setActiveOperatorGlobal = (operator) => {
  _activeOperator = operator
}

export const getActiveOperatorGlobal = () => _activeOperator

export const pickMemberColor = (index = 0) => MEMBER_COLORS[index % MEMBER_COLORS.length]

export const hashPin = async (pin) => {
  const normalized = String(pin || '').trim()
  if (!normalized) return null
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const verifyMemberPin = async (member, pin) => {
  if (!member?.pinHash) return true
  const entered = await hashPin(pin)
  return entered === member.pinHash
}

export const saveOperatorSession = (userId, operator) => {
  if (!userId || !operator) return
  try {
    sessionStorage.setItem(`${OPERATOR_SESSION_KEY}:${userId}`, JSON.stringify({
      id: operator.id,
      name: operator.name,
      color: operator.color || null,
    }))
    touchOperatorActivity(userId)
  } catch {}
  setActiveOperatorGlobal({
    id: operator.id,
    name: operator.name,
    color: operator.color || null,
  })
}

export const loadOperatorSession = (userId) => {
  if (!userId) return null
  try {
    const raw = sessionStorage.getItem(`${OPERATOR_SESSION_KEY}:${userId}`)
    if (!raw) return null
    const operator = JSON.parse(raw)
    if (!operator?.id || !operator?.name) return null
    setActiveOperatorGlobal(operator)
    return operator
  } catch {
    return null
  }
}

export const clearOperatorSession = (userId) => {
  if (!userId) return
  try {
    sessionStorage.removeItem(`${OPERATOR_SESSION_KEY}:${userId}`)
    sessionStorage.removeItem(`${OPERATOR_ACTIVITY_KEY}:${userId}`)
  } catch {}
  setActiveOperatorGlobal(null)
}

export const touchOperatorActivity = (userId) => {
  if (!userId) return
  try {
    sessionStorage.setItem(`${OPERATOR_ACTIVITY_KEY}:${userId}`, String(Date.now()))
  } catch {}
}

export const isOperatorSessionExpired = (userId) => {
  if (!userId) return true
  try {
    const raw = sessionStorage.getItem(`${OPERATOR_ACTIVITY_KEY}:${userId}`)
    if (!raw) return true
    return Date.now() - Number(raw) > OPERATOR_INACTIVITY_MS
  } catch {
    return true
  }
}

export const OperatorContext = createContext({
  operator: null,
  teamMembers: [],
  selectOperator: () => {},
  requestOperatorSwitch: () => {},
  refreshTeamMembers: async () => {},
})

export const useOperator = () => useContext(OperatorContext)
