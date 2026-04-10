/**
 * Web Push no cliente (VAPID público).
 * Defina VITE_VAPID_PUBLIC_KEY no .env (par gerado com web-push / npx web-push generate-vapid-keys).
 */

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i)
  return arr
}

export const getVapidPublicKey = () => {
  const k = import.meta.env.VITE_VAPID_PUBLIC_KEY
  return typeof k === 'string' && k.trim() ? k.trim() : ''
}

export const isPushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

export const getNotificationPermission = () =>
  typeof Notification !== 'undefined' ? Notification.permission : 'denied'

export async function getServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.ready
}

/** Assina push e devolve PushSubscription ou null */
export async function subscribeToPush() {
  const vapid = getVapidPublicKey()
  if (!vapid) {
    console.warn('[push] VITE_VAPID_PUBLIC_KEY ausente — configure no .env')
    return null
  }
  const reg = await getServiceWorkerRegistration()
  if (!reg) return null

  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid),
  })
}

export async function unsubscribePush() {
  const reg = await getServiceWorkerRegistration()
  if (!reg) return false
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return true
  try {
    return await sub.unsubscribe()
  } catch {
    return false
  }
}

export async function getExistingPushSubscription() {
  const reg = await getServiceWorkerRegistration()
  if (!reg) return null
  return reg.pushManager.getSubscription()
}
