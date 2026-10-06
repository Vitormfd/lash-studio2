// Histórico do Simulador de Cílios (Supabase). Fotos ficam no bucket PRIVADO
// lash-simulations e são exibidas por URLs assinadas de curta duração.
import { getClient } from '../../lib/supabase'
import { SETTINGS_VERSION } from './catalog'

const BUCKET = 'lash-simulations'
const SIGNED_URL_SECONDS = 60 * 30
const HISTORY_LIMIT = 60

const uuidV4 = () => {
  if (crypto.randomUUID) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const FRIENDLY_ERRORS = {
  lash_sim_full_access_required: 'Salvar no histórico é exclusivo do plano completo.',
  lash_sim_monthly_limit: 'Você atingiu o limite de simulações salvas deste mês.',
  lash_sim_rate_limited: 'Muitas simulações salvas em sequência. Aguarde um minuto e tente de novo.',
  lash_sim_not_lash: 'O Simulador de Cílios é exclusivo para Lash Designers.',
}

export class SimulationSaveError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

const toFriendlyError = (error, fallback) => {
  const raw = String(error?.message || '')
  const code = Object.keys(FRIENDLY_ERRORS).find((key) => raw.includes(key))
  console.error('[lash-simulator]', raw || error)
  return new SimulationSaveError(code ? FRIENDLY_ERRORS[code] : fallback, code || 'unknown')
}

const requireClient = async () => {
  const sb = getClient()
  if (!sb) throw new SimulationSaveError('Sem conexão com o servidor. Tente novamente.', 'offline')
  const { data } = await sb.auth.getSession()
  const userId = data?.session?.user?.id
  if (!userId) throw new SimulationSaveError('Entre na sua conta para salvar simulações.', 'auth')
  return { sb, userId }
}

/**
 * Salva uma simulação. A foto original só é enviada quando veio de upload
 * (modelos de demonstração já estão no app).
 */
export const saveSimulation = async ({ resultBlob, originalBlob, source, modelId, settings }) => {
  const { sb, userId } = await requireClient()
  const id = uuidV4()
  const folder = `${userId}/${id}`
  const resultPath = `${folder}/result.jpg`
  const originalPath = source === 'upload' && originalBlob ? `${folder}/original.jpg` : null
  const uploaded = []

  try {
    const uploads = [{ path: resultPath, blob: resultBlob }]
    if (originalPath) uploads.push({ path: originalPath, blob: originalBlob })
    for (const { path, blob } of uploads) {
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false,
      })
      if (error) throw error
      uploaded.push(path)
    }

    const { data, error } = await sb.from('lash_simulations').insert({
      id,
      user_id: userId,
      source,
      model_id: source === 'model' ? modelId : null,
      original_path: originalPath,
      result_path: resultPath,
      technique: settings.technique,
      volume_d: settings.volume,
      curl: settings.curl,
      thickness_mm: settings.thicknessMm,
      classic_thickness_mm: settings.classicThicknessMm,
      mapping: settings.mapping,
      mapping_lengths: settings.lengths,
      texture: settings.texture,
      settings_version: SETTINGS_VERSION,
    }).select('id, created_at').single()
    if (error) throw error
    return data
  } catch (error) {
    if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded).catch(() => {})
    throw toFriendlyError(error, 'Não conseguimos salvar a simulação. Tente novamente.')
  }
}

const rowToSimulation = (row) => ({
  id: row.id,
  source: row.source,
  modelId: row.model_id,
  originalPath: row.original_path,
  resultPath: row.result_path,
  createdAt: row.created_at,
  settings: {
    technique: row.technique,
    volume: row.volume_d,
    curl: row.curl,
    thicknessMm: Number(row.thickness_mm),
    classicThicknessMm: row.classic_thickness_mm == null ? null : Number(row.classic_thickness_mm),
    mapping: row.mapping,
    lengths: Array.isArray(row.mapping_lengths) ? row.mapping_lengths : [],
    texture: row.texture || 'none',
  },
})

/** Lista o histórico com URLs assinadas (válidas por 30 minutos). */
export const listSimulations = async () => {
  const { sb } = await requireClient()
  const { data, error } = await sb
    .from('lash_simulations')
    .select('id, source, model_id, original_path, result_path, technique, volume_d, curl, thickness_mm, classic_thickness_mm, mapping, mapping_lengths, texture, created_at')
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)
  if (error) throw toFriendlyError(error, 'Não conseguimos carregar o histórico.')

  const simulations = (data || []).map(rowToSimulation)
  const paths = simulations.flatMap((s) => [s.resultPath, s.originalPath]).filter(Boolean)
  if (!paths.length) return simulations

  const { data: signed, error: signError } = await sb.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS)
  if (signError) throw toFriendlyError(signError, 'Não conseguimos carregar as fotos do histórico.')
  const urlByPath = new Map((signed || []).map((item) => [item.path, item.signedUrl]))
  return simulations.map((s) => ({
    ...s,
    resultUrl: urlByPath.get(s.resultPath) || '',
    originalUrl: s.originalPath ? urlByPath.get(s.originalPath) || '' : '',
  }))
}

/** Exclui arquivos e registro. Arquivos primeiro: a foto da cliente nunca fica órfã. */
export const deleteSimulation = async (simulation) => {
  const { sb } = await requireClient()
  const paths = [simulation.resultPath, simulation.originalPath].filter(Boolean)
  if (paths.length) {
    const { error } = await sb.storage.from(BUCKET).remove(paths)
    if (error) throw toFriendlyError(error, 'Não conseguimos excluir a simulação. Tente novamente.')
  }
  const { error } = await sb.from('lash_simulations').delete().eq('id', simulation.id)
  if (error) throw toFriendlyError(error, 'Não conseguimos excluir a simulação. Tente novamente.')
}

export const fetchQuota = async () => {
  const { sb } = await requireClient()
  const { data, error } = await sb.rpc('lash_simulator_quota')
  if (error || !data) return null
  return { used: Number(data.used) || 0, limit: Number(data.limit) || 0 }
}
