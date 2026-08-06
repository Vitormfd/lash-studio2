/** Horário de trabalho por dia da semana — usado em Settings e agendamento público */

import { timeToMins } from './utils'

export const WORK_DAY_ORDER = [
  { key: 'mon', label: 'Segunda-feira', short: 'Seg' },
  { key: 'tue', label: 'Terça-feira', short: 'Ter' },
  { key: 'wed', label: 'Quarta-feira', short: 'Qua' },
  { key: 'thu', label: 'Quinta-feira', short: 'Qui' },
  { key: 'fri', label: 'Sexta-feira', short: 'Sex' },
  { key: 'sat', label: 'Sábado', short: 'Sáb' },
  { key: 'sun', label: 'Domingo', short: 'Dom' },
]

/** Índice getDay()/extract(dow): 0=dom … 6=sáb */
export const WEEKDAY_KEYS_BY_DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const DEFAULT_DAY_OPEN = { closed: false, start: '08:00', end: '18:00' }

export const DEFAULT_WORK_HOURS = {
  mon: { ...DEFAULT_DAY_OPEN },
  tue: { ...DEFAULT_DAY_OPEN },
  wed: { ...DEFAULT_DAY_OPEN },
  thu: { ...DEFAULT_DAY_OPEN },
  fri: { ...DEFAULT_DAY_OPEN },
  sat: { closed: false, start: '08:00', end: '14:00' },
  sun: { closed: true, start: '08:00', end: '18:00' },
}

const toTwo = (n) => String(n).padStart(2, '0')

export const normalizeTimeHhmm = (raw, fallback = '08:00') => {
  if (raw == null) return fallback
  const s = String(raw).trim()
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return fallback
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return fallback
  }
  return `${toTwo(h)}:${toTwo(min)}`
}

export const normalizeWorkDay = (raw, fallback = DEFAULT_DAY_OPEN) => {
  const base = fallback || DEFAULT_DAY_OPEN
  const closed = raw?.closed === true || raw?.closed === 'true' || raw?.closed === 1
  let start = normalizeTimeHhmm(raw?.start ?? raw?.start_time, base.start)
  let end = normalizeTimeHhmm(raw?.end ?? raw?.end_time, base.end)
  if (timeToMins(end) <= timeToMins(start)) {
    start = base.start
    end = base.end
  }
  return { closed, start, end }
}

export const normalizeWorkHours = (raw) => {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  for (const { key } of WORK_DAY_ORDER) {
    out[key] = normalizeWorkDay(src[key], DEFAULT_WORK_HOURS[key])
  }
  return out
}

export const weekdayKeyFromYmd = (ymd) => {
  if (!ymd) return null
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return WEEKDAY_KEYS_BY_DOW[d.getDay()]
}

/**
 * @returns {{ closed: boolean, start: string|null, end: string|null, weekday: string|null }}
 */
export const getWorkWindowForDate = (workHours, ymd) => {
  const weekday = weekdayKeyFromYmd(ymd)
  const hours = normalizeWorkHours(workHours)
  if (!weekday || !hours[weekday]) {
    return { closed: false, start: DEFAULT_DAY_OPEN.start, end: DEFAULT_DAY_OPEN.end, weekday }
  }
  const day = hours[weekday]
  if (day.closed) {
    return { closed: true, start: null, end: null, weekday }
  }
  return { closed: false, start: day.start, end: day.end, weekday }
}

/** Opções de horário para selects (06:00–22:00, passo 30 min) */
export const WORK_TIME_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const mins = 6 * 60 + i * 30
  return `${toTwo(Math.floor(mins / 60))}:${toTwo(mins % 60)}`
})
