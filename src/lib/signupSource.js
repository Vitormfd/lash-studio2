/**
 * Origem do cadastro (UTMs), gravada em auth.users.raw_user_meta_data->'signup_source'.
 * Não aparece em nenhuma tela: serve só para consultar no banco quem veio de onde
 * (ex.: QR code do PDF de um curso parceiro).
 *
 * Guarda a primeira origem vista no navegador por até 30 dias, porque a pessoa pode
 * chegar pelo link, sair e voltar depois para se cadastrar.
 */

const STORAGE_KEY = 'es_signup_source'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

const clean = (value) => String(value || '').trim().slice(0, 100)

export const captureSignupSource = () => {
  if (typeof window === 'undefined') return
  try {
    const params = new URLSearchParams(window.location.search)
    if (!params.get('utm_source')) return
    const existing = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')
    if (existing?.capturedAt && Date.now() - Date.parse(existing.capturedAt) < MAX_AGE_MS) return
    const source = { capturedAt: new Date().toISOString() }
    for (const key of KEYS) {
      const value = clean(params.get(key))
      if (value) source[key] = value
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(source))
  } catch {
    // Sem localStorage: só não registra a origem.
  }
}

export const readSignupSource = () => {
  if (typeof window === 'undefined') return null
  try {
    const source = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')
    if (!source?.utm_source) return null
    if (source.capturedAt && Date.now() - Date.parse(source.capturedAt) >= MAX_AGE_MS) return null
    return source
  } catch {
    return null
  }
}
