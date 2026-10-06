// Geração realista com IA (Edge Function lash-simulator-ai → Google Gemini).
//
// Só a faixa dos olhos é enviada. A resposta da IA é colada de volta apenas numa
// máscara suave em volta da linha dos cílios superiores: o resto da foto continua
// sendo o original, pixel a pixel — a IA não tem como trocar o rosto da cliente.
import { getClient, getSupabaseConfig } from '../../lib/supabase'
import { IRIS_DIAMETER_MM } from './faceAnalysis'
import { canvasToBlob } from './imageUtils'

const FUNCTION_NAME = 'lash-simulator-ai'
const REQUEST_TIMEOUT_MS = 80_000
const MAX_SEND_SIDE = 1024

// Proporções aceitas pelo Gemini.
const ASPECT_RATIOS = [
  ['21:9', 21 / 9], ['16:9', 16 / 9], ['3:2', 3 / 2], ['4:3', 4 / 3], ['5:4', 5 / 4], ['1:1', 1],
]

const FRIENDLY_ERRORS = {
  ai_not_configured: 'A versão realista com IA ainda não foi ativada. Mostrando a prévia.',
  monthly_limit: 'Você usou todas as gerações com IA deste mês. Mostrando a prévia.',
  in_progress: 'Já existe uma simulação sendo gerada. Aguarde alguns segundos.',
  rate_limited: 'Muitas gerações em sequência. Aguarde alguns minutos e tente de novo.',
  not_lash: 'O Simulador de Cílios é exclusivo para Lash Designers.',
  unauthorized: 'Entre na sua conta para gerar a versão realista com IA.',
}
const GENERIC_ERROR = 'Não conseguimos gerar a versão realista agora. Mostrando a prévia — tente novamente em instantes.'

export class AiSimulationError extends Error {
  constructor(code) {
    super(FRIENDLY_ERRORS[code] || GENERIC_ERROR)
    this.code = code || 'unknown'
  }
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

const pxPerMmOf = (analysis) =>
  (analysis.eyes.reduce((sum, eye) => sum + eye.irisDiameterPx, 0) / analysis.eyes.length) / IRIS_DIAMETER_MM

/** Região enviada para a IA: os dois olhos com folga para os fios, na proporção aceita. */
export const computeAiRegion = (analysis, settings) => {
  const { width, height, eyes } = analysis
  const pxPerMm = pxPerMmOf(analysis)
  const maxLen = Math.max(...settings.lengths) + 3
  const pts = eyes.flatMap((eye) => [...eye.upper, ...eye.lower])
  const eyeW = Math.max(...eyes.map((eye) => eye.width))
  let x0 = Math.min(...pts.map((p) => p.x)) - eyeW * 0.6
  let x1 = Math.max(...pts.map((p) => p.x)) + eyeW * 0.6
  let y0 = Math.min(...pts.map((p) => p.y)) - maxLen * pxPerMm * 1.15
  let y1 = Math.max(...pts.map((p) => p.y)) + eyeW * 0.45

  const ratio = (x1 - x0) / (y1 - y0)
  const [aspectRatio, target] = ASPECT_RATIOS.reduce((best, item) =>
    Math.abs(Math.log(item[1] / ratio)) < Math.abs(Math.log(best[1] / ratio)) ? item : best)

  // Cresce a dimensão menor até a proporção escolhida.
  if ((x1 - x0) / (y1 - y0) < target) {
    const extra = (y1 - y0) * target - (x1 - x0)
    x0 -= extra / 2
    x1 += extra / 2
  } else {
    const extra = (x1 - x0) / target - (y1 - y0)
    y0 -= extra * 0.6
    y1 += extra * 0.4
  }

  // Mantém dentro da foto (desliza a janela; se não couber, reduz mantendo a proporção).
  let w = x1 - x0
  let h = y1 - y0
  if (w > width) { const s = width / w; w *= s; h *= s }
  if (h > height) { const s = height / h; w *= s; h *= s }
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const x = clamp(cx - w / 2, 0, width - w)
  const y = clamp(cy - h / 2, 0, height - h)
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), aspectRatio }
}

const cropToCanvas = (source, rect, maxSide = MAX_SEND_SIDE) => {
  const scale = Math.min(1, maxSide / Math.max(rect.w, rect.h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(rect.w * scale)
  canvas.height = Math.round(rect.h * scale)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height)
  return canvas
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = () => reject(new Error('ai image decode failed'))
  img.src = src
})

/**
 * Máscara suave cobrindo, em cada olho, da linha dos cílios até a altura máxima
 * dos fios (com folga no canto externo). Desenhada em baixa resolução e ampliada:
 * a interpolação produz a borda esfumada sem depender de ctx.filter (Safari).
 */
const buildLashMask = (analysis, settings, rect) => {
  const { eyes, up } = analysis
  const pxPerMm = pxPerMmOf(analysis)
  const reach = (Math.max(...settings.lengths) + 2.5) * pxPerMm
  const down = { x: -up.x, y: -up.y }
  const shrink = 8
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.round(rect.w / shrink))
  small.height = Math.max(1, Math.round(rect.h / shrink))
  const sctx = small.getContext('2d')
  sctx.fillStyle = '#fff'

  eyes.forEach((eye) => {
    const side = eye.outer.x >= eye.inner.x ? 1 : -1
    const out = { x: -up.y * side, y: up.x * side }
    const lid = eye.upper
    const below = eye.width * 0.07
    const toLocal = (p) => [(p.x - rect.x) / shrink, (p.y - rect.y) / shrink]
    const polygon = []
    lid.forEach((p) => polygon.push({ x: p.x + down.x * below, y: p.y + down.y * below }))
    // Além do canto externo os fios se abrem para o lado.
    const o = eye.outer
    polygon.push({ x: o.x + out.x * eye.width * 0.45 + down.x * below, y: o.y + out.y * eye.width * 0.45 + down.y * below })
    polygon.push({ x: o.x + out.x * eye.width * 0.55 + up.x * reach * 0.8, y: o.y + out.y * eye.width * 0.55 + up.y * reach * 0.8 })
    for (let i = lid.length - 1; i >= 0; i--) {
      const t = i / (lid.length - 1)
      const lift = reach * (0.75 + 0.25 * t)
      const sideways = eye.width * 0.12 * t
      polygon.push({ x: lid[i].x + up.x * lift + out.x * sideways, y: lid[i].y + up.y * lift + out.y * sideways })
    }
    const inner = eye.inner
    polygon.push({ x: inner.x - out.x * eye.width * 0.06 + up.x * reach * 0.5, y: inner.y - out.y * eye.width * 0.06 + up.y * reach * 0.5 })

    sctx.beginPath()
    polygon.forEach((p, index) => {
      const [x, y] = toLocal(p)
      if (index === 0) sctx.moveTo(x, y)
      else sctx.lineTo(x, y)
    })
    sctx.closePath()
    sctx.fill()
  })

  // Duas ampliações sucessivas suavizam mais a borda.
  const mid = document.createElement('canvas')
  mid.width = Math.max(1, Math.round(small.width * 2))
  mid.height = Math.max(1, Math.round(small.height * 2))
  const mctx = mid.getContext('2d')
  mctx.imageSmoothingQuality = 'high'
  mctx.drawImage(small, 0, 0, mid.width, mid.height)
  const mask = document.createElement('canvas')
  mask.width = rect.w
  mask.height = rect.h
  const ctx = mask.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(mid, 0, 0, rect.w, rect.h)
  return mask
}

/** Corrige pequenas diferenças de cor/brilho da IA comparando com a área fora da máscara. */
const matchColors = (aiCanvas, originalCrop, mask) => {
  const w = aiCanvas.width
  const h = aiCanvas.height
  const actx = aiCanvas.getContext('2d', { willReadFrequently: true })
  const ai = actx.getImageData(0, 0, w, h)
  const orig = originalCrop.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data
  const m = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data
  const sumA = [0, 0, 0]
  const sumO = [0, 0, 0]
  let n = 0
  for (let i = 0; i < m.length; i += 16) {
    if (m[i + 3] > 10) continue
    for (let c = 0; c < 3; c++) { sumA[c] += ai.data[i + c]; sumO[c] += orig[i + c] }
    n++
  }
  if (n < 50) return
  const gain = sumO.map((o, c) => clamp(o / Math.max(1, sumA[c]), 0.85, 1.15))
  if (gain.every((g) => Math.abs(g - 1) < 0.01)) return
  for (let i = 0; i < ai.data.length; i += 4) {
    ai.data[i] = Math.min(255, ai.data[i] * gain[0])
    ai.data[i + 1] = Math.min(255, ai.data[i + 1] * gain[1])
    ai.data[i + 2] = Math.min(255, ai.data[i + 2] * gain[2])
  }
  actx.putImageData(ai, 0, 0)
}

/** Monta a foto final: original + cílios da IA somente dentro da máscara. */
export const compositeAiResult = (original, analysis, settings, rect, aiImage) => {
  const output = document.createElement('canvas')
  output.width = analysis.width
  output.height = analysis.height
  const octx = output.getContext('2d')
  octx.drawImage(original, 0, 0, analysis.width, analysis.height)

  const aiCrop = document.createElement('canvas')
  aiCrop.width = rect.w
  aiCrop.height = rect.h
  const actx = aiCrop.getContext('2d', { willReadFrequently: true })
  actx.imageSmoothingQuality = 'high'
  actx.drawImage(aiImage, 0, 0, rect.w, rect.h)

  const originalCrop = document.createElement('canvas')
  originalCrop.width = rect.w
  originalCrop.height = rect.h
  originalCrop.getContext('2d', { willReadFrequently: true }).drawImage(original, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h)

  const mask = buildLashMask(analysis, settings, rect)
  matchColors(aiCrop, originalCrop, mask)

  actx.globalCompositeOperation = 'destination-in'
  actx.drawImage(mask, 0, 0)
  octx.drawImage(aiCrop, rect.x, rect.y)
  return output
}

const getAccessToken = async () => {
  const sb = getClient()
  if (!sb) return ''
  const { data } = await sb.auth.getSession()
  return data?.session?.access_token || ''
}

/**
 * Gera a versão realista. `previewCanvas` (desenho local) vai como esboço de
 * referência para a IA seguir comprimentos e direções do mapeamento.
 */
export const generateAiSimulation = async ({ original, previewCanvas, analysis, settings, signal }) => {
  const token = await getAccessToken()
  if (!token) throw new AiSimulationError('unauthorized')

  const rect = computeAiRegion(analysis, settings)
  const [imageB64, guideB64] = await Promise.all([
    canvasToBlob(cropToCanvas(original, rect), 'image/jpeg', 0.9).then(blobToBase64),
    canvasToBlob(cropToCanvas(previewCanvas, rect), 'image/jpeg', 0.85).then(blobToBase64),
  ])

  const { url, anonKey } = getSupabaseConfig()
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort)

  let payload = null
  try {
    const response = await fetch(`${url}/functions/v1/${FUNCTION_NAME}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        image: imageB64,
        guide: guideB64,
        aspectRatio: rect.aspectRatio,
        eyes: analysis.eyes.length,
        settings,
      }),
      signal: controller.signal,
    })
    try { payload = await response.json() } catch { payload = null }
    if (!response.ok || !payload?.ok || !payload?.image) {
      console.error('[lash-simulator] ai request failed', response.status, payload?.error)
      throw new AiSimulationError(payload?.error)
    }
  } catch (error) {
    if (error instanceof AiSimulationError) throw error
    console.error('[lash-simulator] ai request error', error)
    throw new AiSimulationError(signal?.aborted ? 'aborted' : 'network')
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }

  const aiImage = await loadImage(`data:${payload.mimeType || 'image/png'};base64,${payload.image}`)
  const canvas = compositeAiResult(original, analysis, settings, rect, aiImage)
  return { canvas, usage: { used: payload.used, limit: payload.limit } }
}
