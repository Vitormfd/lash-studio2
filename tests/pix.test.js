import { describe, expect, it } from 'vitest'
import { buildPixPayload, crc16, normalizePixKey } from '../src/lib/pix'

describe('Pix copia e cola', () => {
  it('CRC16 confere com o exemplo do manual do BR Code (Banco Central)', () => {
    const body = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304'
    expect(crc16(body)).toBe('1D3D')
    expect(crc16('123456789')).toBe('29B1')
  })

  it('normaliza a chave conforme o tipo', () => {
    expect(normalizePixKey('phone', '(11) 98765-4321')).toBe('+5511987654321')
    expect(normalizePixKey('phone', '5511987654321')).toBe('+5511987654321')
    expect(normalizePixKey('cpf', '123.456.789-09')).toBe('12345678909')
    expect(normalizePixKey('email', 'Ana@Exemplo.com ')).toBe('ana@exemplo.com')
    expect(normalizePixKey('email', 'sem-arroba')).toBe('')
    expect(normalizePixKey('random', '123E4567-E12B-12D1-A456-426655440000')).toBe('123e4567-e12b-12d1-a456-426655440000')
    expect(normalizePixKey('phone', '123')).toBe('')
  })

  it('monta o código com valor, nome sem acento e CRC válido', () => {
    const code = buildPixPayload({ keyType: 'email', key: 'ana@exemplo.com', amount: 39, name: 'Ana Lúcia Estética', city: 'São Paulo', txid: 'SINAL-abc_123' })
    expect(code).toContain('0014br.gov.bcb.pix0115ana@exemplo.com')
    expect(code).toContain('540539.00')
    expect(code).toContain('5918ANA LUCIA ESTETICA')
    expect(code).toContain('6009SAO PAULO')
    expect(code).toContain('62150511SINALabc123')
    expect(code.slice(-8, -4)).toBe('6304')
    expect(crc16(code.slice(0, -4))).toBe(code.slice(-4))
  })

  it('não gera código com chave inválida', () => {
    expect(buildPixPayload({ keyType: 'cpf', key: '123', amount: 10, name: 'X', city: 'Y' })).toBe('')
  })
})
