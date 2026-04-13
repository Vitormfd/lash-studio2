import { useEffect, useRef } from 'react'
import { getTodayStr, getNextAppointmentToday } from '../lib/dashboardStats'
import { nextAppointmentPushBody } from '../lib/dayMessages'
import { APP_NAME } from '../lib/domain'

/**
 * Lembrete local do próximo horário (Notification API) enquanto o app está ativo.
 * Push com app fechado: Edge Function + cron (ver supabase/functions).
 */
export function useLocalReminders({ appointments, enabled, reminderMinutesBefore = 60, permissionVersion = 0 }) {
  const timersRef = useRef([])

  useEffect(() => {
    if (!enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return
    }

    const clearAll = () => {
      timersRef.current.forEach((id) => clearTimeout(id))
      timersRef.current = []
    }
    clearAll()

    const today = getTodayStr()
    const now = new Date()
    const nextAppt = getNextAppointmentToday(appointments, today, now)

    if (nextAppt && (nextAppt.status === 'pending' || nextAppt.status === 'confirmed')) {
      const [hh, mm] = String(nextAppt.time || '09:00').slice(0, 5).split(':').map(Number)
      const at = new Date(`${nextAppt.date}T${String(hh).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')}:00`)
      const fireAt = at.getTime() - reminderMinutesBefore * 60 * 1000
      const delay = fireAt - Date.now()
      const notifyKey = `lash_local_next_${nextAppt.id}_${today}`

      if (delay > 0 && delay < 1000 * 60 * 60 * 24 && !sessionStorage.getItem(notifyKey)) {
        const id = setTimeout(() => {
          try {
            sessionStorage.setItem(notifyKey, '1')
            new Notification(APP_NAME, {
              body: nextAppointmentPushBody(reminderMinutesBefore),
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: `next-${nextAppt.id}`,
            })
          } catch (_) {}
        }, delay)
        timersRef.current.push(id)
      }
    }

    return clearAll
  }, [appointments, enabled, reminderMinutesBefore, permissionVersion])
}
