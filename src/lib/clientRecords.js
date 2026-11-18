/**
 * Ficha da cliente (anamnese + termo assinado) e fotos de antes/depois.
 *
 * Conta real: tabelas client_records / client_photos e arquivos no bucket privado
 * client-files/<user_id>/<client_id>/... — carregados só quando a ficha é aberta e
 * nunca guardados no navegador (são dados de saúde).
 * Demonstração: ficha no navegador; fotos ficam para a conta de verdade.
 */
import { getClient, local, uid, writeErrorMessage } from './supabase'

const BUCKET = 'client-files'
const SIGNED_URL_SECONDS = 60 * 30
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isRealAccount = (userId) => UUID_RE.test(String(userId || ''))
const demoKey = (userId) => `u_${userId}_client_records`

export const ANAMNESE_FIELDS = [
  { key: 'alergias', label: 'Alergias (cosméticos, cola, esmalte, látex, remédios)' },
  { key: 'medicamentos', label: 'Usa algum remédio?' },
  { key: 'gestante', label: 'Está gestante ou amamentando?', yesNo: true },
  { key: 'saude', label: 'Condição de saúde importante (diabetes, pressão, tireoide, outra)' },
  { key: 'regiao', label: 'Sensibilidade, irritação ou problema na região do procedimento' },
  { key: 'lentes', label: 'Usa lentes de contato?', yesNo: true },
  { key: 'procedimentos', label: 'Fez algum procedimento recente na região?' },
  { key: 'observacoes', label: 'Outras observações' },
]

const fail = (error, fallback) => {
  const raw = String(error?.message || error || '')
  if (/full plan required|access denied/i.test(raw)) {
    return new Error('Seu acesso terminou, então a ficha não foi salva. Assine para continuar.')
  }
  if (/failed to fetch|network/i.test(raw)) {
    return new Error('Sem conexão com a internet: nada foi salvo. Tente de novo.')
  }
  if (/client_records|client_photos|does not exist|schema cache/i.test(raw)) {
    return new Error('A ficha da cliente ainda não está disponível. Tente de novo em alguns minutos.')
  }
  return new Error(fallback || writeErrorMessage(error))
}

const emptyRecord = (clientId) => ({
  clientId,
  anamnese: {},
  consentText: '',
  consentName: '',
  consentSignedAt: null,
  signaturePath: null,
  signatureUrl: null,
  updatedAt: null,
})

const signedUrls = async (sb, paths) => {
  const list = paths.filter(Boolean)
  if (!list.length) return {}
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(list, SIGNED_URL_SECONDS)
  return Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))
}

export const getClientRecord = async (userId, clientId) => {
  if (!isRealAccount(userId)) {
    const all = local.get(demoKey(userId)) || {}
    return { ...emptyRecord(clientId), ...(all[clientId] || {}) }
  }
  const sb = getClient()
  const { data, error } = await sb.from('client_records').select('*').eq('client_id', clientId).eq('user_id', userId).maybeSingle()
  if (error) throw fail(error, 'Não foi possível abrir a ficha. Tente de novo.')
  if (!data) return emptyRecord(clientId)
  const urls = await signedUrls(sb, [data.signature_path])
  return {
    clientId,
    anamnese: data.anamnese || {},
    consentText: data.consent_text || '',
    consentName: data.consent_name || '',
    consentSignedAt: data.consent_signed_at,
    signaturePath: data.signature_path,
    signatureUrl: urls[data.signature_path] || null,
    updatedAt: data.updated_at,
  }
}

/** Grava anamnese e, se vier `signatureBlob`, a assinatura do termo. */
export const saveClientRecord = async (userId, record, { signatureBlob, signatureDataUrl } = {}) => {
  const now = new Date().toISOString()
  if (!isRealAccount(userId)) {
    const all = local.get(demoKey(userId)) || {}
    const next = { ...emptyRecord(record.clientId), ...record, updatedAt: now }
    if (signatureDataUrl) next.signatureUrl = signatureDataUrl
    local.set(demoKey(userId), { ...all, [record.clientId]: next })
    return next
  }
  const sb = getClient()
  let signaturePath = record.signaturePath || null
  let uploaded = null
  try {
    if (signatureBlob) {
      uploaded = `${userId}/${record.clientId}/assinatura-${Date.now()}.png`
      const { error } = await sb.storage.from(BUCKET).upload(uploaded, signatureBlob, { contentType: 'image/png', upsert: false })
      if (error) throw error
    }
    const { error } = await sb.from('client_records').upsert({
      client_id: record.clientId,
      user_id: userId,
      anamnese: record.anamnese || {},
      consent_text: record.consentText || null,
      consent_name: record.consentName || null,
      consent_signed_at: record.consentSignedAt || null,
      signature_path: uploaded || signaturePath,
      updated_at: now,
    }, { onConflict: 'client_id' })
    if (error) throw error
    // Assinatura nova substitui a antiga.
    if (uploaded && signaturePath && signaturePath !== uploaded) {
      sb.storage.from(BUCKET).remove([signaturePath]).catch(() => {})
    }
    signaturePath = uploaded || signaturePath
  } catch (error) {
    if (uploaded) sb.storage.from(BUCKET).remove([uploaded]).catch(() => {})
    throw fail(error, 'Não foi possível salvar a ficha. Tente de novo.')
  }
  return getClientRecord(userId, record.clientId)
}

export const listClientPhotos = async (userId, clientId) => {
  if (!isRealAccount(userId)) return []
  const sb = getClient()
  const { data, error } = await sb
    .from('client_photos')
    .select('*')
    .eq('user_id', userId)
    .eq('client_id', clientId)
    .order('taken_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw fail(error, 'Não foi possível carregar as fotos.')
  const urls = await signedUrls(sb, (data || []).map((r) => r.path))
  return (data || []).map((r) => ({
    id: r.id,
    path: r.path,
    kind: r.kind,
    caption: r.caption || '',
    takenOn: r.taken_on,
    url: urls[r.path] || null,
  }))
}

/** Reduz a foto (lado maior até `max` px) para JPEG — fotos de celular chegam a 5–10 MB. */
export const compressImage = (file, max = 1600, quality = 0.84) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível ler a foto.'))), 'image/jpeg', quality)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Esse arquivo não é uma foto que o app consiga abrir.'))
    }
    img.src = url
  })

export const addClientPhoto = async (userId, clientId, file, { kind = 'outro', caption = '' } = {}) => {
  if (!isRealAccount(userId)) throw new Error('As fotos ficam disponíveis na sua conta (a demonstração não guarda fotos).')
  const sb = getClient()
  const blob = await compressImage(file)
  const id = uid()
  const path = `${userId}/${clientId}/${id}.jpg`
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (upErr) throw fail(upErr, 'Não foi possível enviar a foto. Tente de novo.')
  const { error } = await sb.from('client_photos').insert({ id, user_id: userId, client_id: clientId, path, kind, caption: caption || null })
  if (error) {
    sb.storage.from(BUCKET).remove([path]).catch(() => {})
    throw fail(error, 'Não foi possível salvar a foto. Tente de novo.')
  }
}

export const deleteClientPhoto = async (userId, photo) => {
  const sb = getClient()
  const { error } = await sb.from('client_photos').delete().eq('id', photo.id).eq('user_id', userId)
  if (error) throw fail(error, 'Não foi possível apagar a foto.')
  await sb.storage.from(BUCKET).remove([photo.path]).catch(() => {})
}

/** Ao excluir a cliente: apaga fotos e assinatura do armazenamento (as linhas saem em cascata). */
export const deleteClientFiles = async (userId, clientId) => {
  if (!isRealAccount(userId)) {
    const all = local.get(demoKey(userId)) || {}
    if (all[clientId]) {
      delete all[clientId]
      local.set(demoKey(userId), all)
    }
    return
  }
  const sb = getClient()
  const folder = `${userId}/${clientId}`
  const { data } = await sb.storage.from(BUCKET).list(folder, { limit: 1000 })
  const paths = (data || []).map((f) => `${folder}/${f.name}`)
  if (paths.length) await sb.storage.from(BUCKET).remove(paths).catch(() => {})
}
