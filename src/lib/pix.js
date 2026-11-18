/**
 * Pix "copia e cola" estático (BR Code, padrão EMV do Banco Central).
 * O dinheiro vai direto para a chave da profissional: o Easy Studio não recebe nem guarda nada.
 */

const field = (id, value) => {
  const v = String(value)
  return `${id}${String(v.length).padStart(2, '0')}${v}`
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como pede o manual do BR Code. */
export const crc16 = (payload) => {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Só letras sem acento, números e espaço (o BR Code não aceita acentos em nome e cidade). */
const plain = (text, max) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max)

/** Formata a chave conforme o tipo. Devolve '' quando não dá para usar. */
export const normalizePixKey = (type, key) => {
  const raw = String(key || '').trim()
  if (!raw) return ''
  if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw.toLowerCase() : ''
  if (type === 'cpf') {
    const d = raw.replace(/\D/g, '')
    return d.length === 11 || d.length === 14 ? d : ''
  }
  if (type === 'phone') {
    let d = raw.replace(/\D/g, '')
    if (d.length === 10 || d.length === 11) d = `55${d}`
    return d.length === 12 || d.length === 13 ? `+${d}` : ''
  }
  // chave aleatória (EVP)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw.toLowerCase() : ''
}

/**
 * Monta o código. `txid` identifica o pagamento no extrato (até 25 letras/números).
 * Retorna '' quando a chave é inválida.
 */
export const buildPixPayload = ({ keyType, key, amount, name, city, txid = '***', description = '' }) => {
  const pixKey = normalizePixKey(keyType, key)
  if (!pixKey) return ''
  const desc = plain(description, 40)
  const account = field('00', 'br.gov.bcb.pix') + field('01', pixKey) + (desc ? field('02', desc) : '')
  const value = Number(amount)
  const safeTxid = String(txid || '***').replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***'
  const body =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    (Number.isFinite(value) && value > 0 ? field('54', value.toFixed(2)) : '') +
    field('58', 'BR') +
    field('59', plain(name, 25) || 'RECEBEDOR') +
    field('60', plain(city, 15) || 'BRASIL') +
    field('62', field('05', safeTxid)) +
    '6304'
  return body + crc16(body)
}
