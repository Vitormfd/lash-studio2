export const normalizePhoneDigits = (value) => String(value || '').replace(/\D/g, '').slice(0, 11)

export const maskPhoneBr = (value) => {
  const d = normalizePhoneDigits(value)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}
