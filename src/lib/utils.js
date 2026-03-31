// ─── DATE / TIME HELPERS ─────────────────────────────────────────────────────
export const apptDurationMin = (a) => {
  const n = a && Number(a.durationMinutes)
  return n > 0 ? n : 60
}

export const timeToMins = (t) => {
  if (t == null || t === '') return 0
  const s = String(t).trim().slice(0, 8)
  const p = s.split(':')
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0)
}

export const apptIntervalsOverlap = (d1, start1, dur1, d2, start2, dur2) => {
  if (d1 !== d2) return false
  const s1 = timeToMins(start1), e1 = s1 + (dur1 || 60)
  const s2 = timeToMins(start2), e2 = s2 + (dur2 || 60)
  return s1 < e2 && s2 < e1
}

export const apptCoversSlotHour = (appt, dateStr, hourLabel) =>
  appt &&
  appt.date === dateStr &&
  apptIntervalsOverlap(appt.date, appt.time, apptDurationMin(appt), dateStr, hourLabel, 60)

export const apptStartsInHourRow = (appt, hourLabel) => {
  const a = timeToMins(appt.time)
  const r = timeToMins(hourLabel)
  return a >= r && a < r + 60
}

export const formatDurationLabel = (m) => {
  const n = Number(m) || 60
  if (n >= 60 && n % 60 === 0) return `${n / 60} h`
  if (n > 60) return `${Math.floor(n / 60)} h ${n % 60} min`
  return `${n} min`
}

export const endTimeLabel = (startTime, durM) => {
  const end = timeToMins(startTime) + (Number(durM) || 60)
  const h = Math.floor(end / 60) % 24,
    mi = end % 60
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

// ─── COLOR HELPERS ───────────────────────────────────────────────────────────
export const normalizeServiceColor = (c) => {
  if (c == null || String(c).trim() === '') return null
  let h = String(c).trim()
  if (!h.startsWith('#')) return null
  h = h.slice(1)
  if (h.length === 3) h = h.split('').map((x) => x + x).join('')
  if (!/^[0-9A-Fa-f]{6}$/.test(h)) return null
  return '#' + h.toUpperCase()
}

export const hexToRgba = (hex, alpha) => {
  const n = normalizeServiceColor(hex)
  if (!n) return null
  const v = parseInt(n.slice(1), 16)
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255
  return `rgba(${r},${g},${b},${alpha})`
}

// ─── CALENDAR CONSTANTS ──────────────────────────────────────────────────────
export const HOURS = Array.from({ length: 13 }, (_, i) => `${(i + 8).toString().padStart(2, '0')}:00`)
export const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─── SERVICE CONSTANTS ───────────────────────────────────────────────────────
export const DURATION_OPTIONS = [30, 40, 45, 50, 60, 90, 120, 150, 180]

export const SERVICE_COLOR_PRESETS = [
  { name: 'Rosé', hex: '#C17B82' },
  { name: 'Blush', hex: '#E8B4B8' },
  { name: 'Lavanda', hex: '#9B8FB8' },
  { name: 'Sálvia', hex: '#7BAF9A' },
  { name: 'Areia', hex: '#C4A48A' },
  { name: 'Coral', hex: '#E8988A' },
  { name: 'Azul', hex: '#7BA3C7' },
  { name: 'Dourado', hex: '#C9A962' },
]
