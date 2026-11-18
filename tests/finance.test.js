import { describe, expect, it } from 'vitest'
import { summarizeMonth } from '../src/lib/finance'
import { normalizeExtras } from '../src/lib/extras'

const appointments = [
  { id: 'a', date: '2026-11-03', status: 'done', value: 100, paymentValue: 100, paymentMethod: 'credit_card', serviceId: 's' },
  { id: 'b', date: '2026-11-04', status: 'done', value: 150, paymentMethod: 'pix', serviceId: 's' },
  { id: 'c', date: '2026-11-05', status: 'no_show', value: 150, serviceId: 's' },
  { id: 'd', date: '2026-11-06', status: 'pending', value: 80, serviceId: 's' },
]
const services = [{ id: 's', cost: 10 }]

describe('resumo do mês', () => {
  it('sem recursos extras o lucro continua igual', () => {
    const r = summarizeMonth({ appointments, services, avgCost: 0, cashExpenses: [], month: '2026-11' })
    expect(r.revenue).toBe(250)
    expect(r.expected).toBe(80)
    expect(r.fees).toBe(0)
    expect(r.fixedTotal).toBe(0)
    expect(r.profit).toBe(250 - r.cost)
  })

  it('com custos fixos e taxas, desconta os dois', () => {
    const financeExtras = normalizeExtras({ financeExtras: { enabled: true, fixedCosts: [{ name: 'Aluguel', amount: 50 }], fees: { credit_card: 5, pix: 1 } } }).financeExtras
    const r = summarizeMonth({ appointments, services, avgCost: 0, cashExpenses: [], month: '2026-11', financeExtras })
    expect(r.fees).toBeCloseTo(5 + 1.5)
    expect(r.fixedTotal).toBe(50)
    expect(r.profit).toBeCloseTo(250 - r.cost - 6.5 - 50)
  })
})
