import { toLocalYmd } from './dashboardStats'

export const RECURRING_FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Toda semana' },
  { value: 'biweekly', label: 'A cada 15 dias' },
  { value: 'monthly', label: 'Todo mês' },
]

export const RECURRING_FREQUENCY_LABELS = RECURRING_FREQUENCY_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.value]: o.label }), {}
)

export const DEFAULT_RECURRING_FREQUENCY = 'monthly'

/** Quantos agendamentos futuros são criados automaticamente ao marcar um cliente como fixo. */
export const FIXED_CLIENT_FUTURE_OCCURRENCES = 5

export const WEEKDAY_LABELS_FULL = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado',
]

const RECURRING_FREQUENCY_VALUES = new Set(RECURRING_FREQUENCY_OPTIONS.map((o) => o.value))

export const normalizeRecurringFrequency = (value) =>
  RECURRING_FREQUENCY_VALUES.has(value) ? value : DEFAULT_RECURRING_FREQUENCY

const shiftYmdByDays = (ymd, days) => {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(y, m - 1, d, 12)
  date.setDate(date.getDate() + days)
  return toLocalYmd(date)
}

const shiftYmdByMonths = (ymd, months) => {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(y, m - 1, d, 12)
  const targetMonthIndex = date.getMonth() + months
  date.setMonth(targetMonthIndex)
  const normalizedTarget = ((targetMonthIndex % 12) + 12) % 12
  // Se o mês de destino não tem esse dia (ex.: 31 em abril), o JS estoura pro mês
  // seguinte — nesse caso, volta pro último dia do mês pretendido.
  if (date.getMonth() !== normalizedTarget) date.setDate(0)
  return toLocalYmd(date)
}

/** Próxima data (YYYY-MM-DD) de um cliente fixo, dada a data anterior e a frequência. */
export const addRecurringInterval = (ymd, frequency) => {
  const freq = normalizeRecurringFrequency(frequency)
  if (freq === 'weekly') return shiftYmdByDays(ymd, 7)
  if (freq === 'biweekly') return shiftYmdByDays(ymd, 14)
  return shiftYmdByMonths(ymd, 1)
}
