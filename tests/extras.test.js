import { describe, expect, it } from 'vitest'
import {
  buildBirthdayText,
  depositAmountFor,
  fixedCostsTotal,
  isValidSlug,
  normalizeExtras,
  parseBirthdayInput,
  paymentFeeFor,
  slugify,
  upcomingBirthdays,
} from '../src/lib/extras'

describe('recursos extras', () => {
  it('tudo desligado por padrão', () => {
    const e = normalizeExtras(undefined)
    expect([e.profile.enabled, e.deposit.enabled, e.clientRecords.enabled, e.birthdays.enabled, e.financeExtras.enabled]).toEqual([false, false, false, false, false])
  })

  it('sinal: porcentagem, fixo e limite no preço (mesma conta do banco)', () => {
    expect(depositAmountFor({ enabled: true, type: 'percent', value: 30 }, 130)).toBe(39)
    expect(depositAmountFor({ enabled: true, type: 'percent', value: 33 }, 99.9)).toBe(32.97)
    expect(depositAmountFor({ enabled: true, type: 'fixed', value: 50 }, 130)).toBe(50)
    expect(depositAmountFor({ enabled: true, type: 'fixed', value: 99999 }, 130)).toBe(130)
    expect(depositAmountFor({ enabled: false, type: 'fixed', value: 50 }, 130)).toBe(0)
  })

  it('apelido do link', () => {
    expect(slugify('Estúdio da Ana!')).toBe('estudio-da-ana')
    expect(slugify('  --Lash  Designer--  ')).toBe('lash-designer')
    expect(isValidSlug('estudio-da-ana')).toBe(true)
    expect(isValidSlug('ab')).toBe(false)
    expect(isValidSlug('-ana')).toBe(false)
    expect(isValidSlug('Ana')).toBe(false)
  })

  it('aniversário dia/mês', () => {
    expect(parseBirthdayInput('05/03')).toBe('03-05')
    expect(parseBirthdayInput('5/3')).toBe('03-05')
    expect(parseBirthdayInput('29/02')).toBe('02-29')
    expect(parseBirthdayInput('31/04')).toBeUndefined()
    expect(parseBirthdayInput('10/13')).toBeUndefined()
    expect(parseBirthdayInput('')).toBeNull()
  })

  it('aniversariantes da semana, inclusive na virada do ano', () => {
    const clients = [
      { id: 1, name: 'Bia', birthday: '01-02' },
      { id: 2, name: 'Ana', birthday: '12-30' },
      { id: 3, name: 'Carla', birthday: '06-15' },
      { id: 4, name: 'Duda', birthday: null },
    ]
    const list = upcomingBirthdays(clients, new Date(2026, 11, 29), 7)
    expect(list.map((b) => [b.client.name, b.daysAway])).toEqual([['Ana', 1], ['Bia', 4]])
  })

  it('29/02 comemora em 28/02 em ano não bissexto', () => {
    const list = upcomingBirthdays([{ id: 1, name: 'Léa', birthday: '02-29' }], new Date(2027, 1, 27), 3)
    expect(list[0].daysAway).toBe(1)
  })

  it('mensagem de aniversário usa o primeiro nome', () => {
    expect(buildBirthdayText('Parabéns, {nome}!', 'Maria Clara Souza')).toBe('Parabéns, Maria!')
  })

  it('custos fixos e taxas só contam ligados', () => {
    const fin = normalizeExtras({ financeExtras: { enabled: true, fixedCosts: [{ name: 'Aluguel', amount: 800 }, { name: 'MEI', amount: '75,90' }], fees: { credit_card: 4.99 } } }).financeExtras
    expect(fixedCostsTotal(fin)).toBeCloseTo(875.9)
    expect(paymentFeeFor(fin, 'credit_card', 200)).toBeCloseTo(9.98)
    expect(paymentFeeFor(fin, 'pix', 200)).toBe(0)
    expect(fixedCostsTotal({ ...fin, enabled: false })).toBe(0)
  })
})
