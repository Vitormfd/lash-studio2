import { describe, expect, it } from 'vitest'
import { appointmentsCsv, clientsCsv, toCsv } from '../src/lib/csv'

describe('planilhas', () => {
  it('usa ; e vírgula decimal, com BOM para o Excel', () => {
    const csv = toCsv(['A', 'B'], [[1.5, 'x;y']])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('1,5;"x;y"')
  })

  it('não deixa texto virar fórmula no Excel', () => {
    const csv = clientsCsv([{ name: '=HYPERLINK("x")', phone: '+5511999999999', notes: '' }])
    expect(csv).toContain('"\'=HYPERLINK(""x"")"')
    expect(csv).toContain("'+5511999999999")
  })

  it('agendamentos com cliente, serviço e situação', () => {
    const csv = appointmentsCsv(
      [{ date: '2026-11-20', time: '09:00:00', clientId: 'c', serviceId: 's', status: 'no_show', value: 120, depositAmount: 36, depositStatus: 'paid' }],
      [{ id: 'c', name: 'Ana' }],
      [{ id: 's', name: 'Volume russo' }],
    )
    expect(csv).toContain('20/11/2026;09:00;Ana;Volume russo;Faltou;120;;;Pago (36,00);')
  })
})
