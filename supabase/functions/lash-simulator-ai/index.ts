// Simulador de Cílios — geração realista com IA (Google Gemini).
//
// Recebe só o recorte da região dos olhos (+ um esboço de referência), valida a
// profissional (JWT + perfil lash + cota), monta o prompt a partir de uma lista fixa
// de opções e devolve a imagem editada. Nada é armazenado aqui: a foto passa pela
// memória e é descartada. A chave da IA nunca chega ao navegador.
import { createClient } from 'npm:@supabase/supabase-js@2.49.8'

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
// Colar no terminal pode trazer marcadores invisíveis; mantém só ASCII visível.
const cleanSecret = (value: string) => value.replace(/\x1b?\[20[01]~/g, '').replace(/[^\x21-\x7E]/g, '')
const GEMINI_API_KEY = cleanSecret(Deno.env.get('GEMINI_API_KEY') || '')
const GEMINI_MODEL = (Deno.env.get('GEMINI_IMAGE_MODEL') || 'gemini-2.5-flash-image').trim()

const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const GEMINI_TIMEOUT_MS = 60_000
const ASPECT_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'])

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

// ─── Opções aceitas (espelho de src/features/lashSimulator/catalog.js) ─────────
const TECHNIQUES: Record<string, (d: number | null) => string> = {
  fio_a_fio: () => 'classic one-by-one extensions: exactly one synthetic lash bonded to each natural lash, clean and defined, no fans',
  volume_brasileiro: () => 'Brazilian volume: pre-made Y-shaped fibers (each fiber splits into 2 tips), light and soft volume',
  volume_russo: (d) => `Russian volume: hand-made fans of ${d} ultra-fine fibers on each natural lash, soft fluffy density`,
  volume_egipcio: (d) => `Egyptian volume: pre-made W-shaped fans of ${d} tips joined at the base, defined spiky texture`,
  volume_ingles: (d) => `English volume: pre-made ${d}D fans, medium-to-intense fullness`,
  volume_arabe: (d) => `Arabic volume: pre-made ${d}D fans concentrated at the base giving a strong eyeliner effect along the lash line`,
  volume_hibrido: (d) => `hybrid set: mix of classic single lashes and ${d}D volume fans, textured natural-looking result`,
  mega_volume: (d) => `mega volume: dense hand-made fans of ${d} ultra-fine fibers per natural lash, very full and dramatic, dark lash line`,
}
const CURLS: Record<string, string> = {
  B: 'B curl (gentle, almost straight lift)',
  C: 'C curl (medium, classic lift)',
  CC: 'CC curl (between C and D, more lift)',
  D: 'D curl (strong curl, very open look)',
  L: 'L curl (straight base then upward bend at the tip)',
  'L+': 'L+ curl (straight base with a sharper upward bend)',
}
const MAPPINGS: Record<string, string> = {
  natural: 'natural mapping following natural growth',
  boneca: 'doll-eye mapping: longest lashes at the center, rounding the eye',
  gatinho: 'cat-eye mapping: lengths increase steadily toward the outer corner',
  esquilo: 'squirrel mapping: peak length just before the outer corner, then shorter',
  raposa: 'fox-eye mapping: short through the inner two-thirds, then a jump to long lashes on the outer third, lifted and elongated',
  olhar_aberto: 'open-eye mapping: broad emphasis across the center, opening the eye vertically',
  kim_k: 'Kim K style: shorter base layer with longer closed "wet" spikes spaced along the lash line',
  wispy: 'wispy style: frequent longer spikes over a fluffy base, feathery texture',
  personalizado: 'custom mapping',
}
const TEXTURES: Record<string, string> = {
  none: '',
  kimk: 'Add longer closed "wet-look" spikes spaced along the lash line (Kim K texture).',
  wispy: 'Add frequent longer spikes for a wispy, feathery texture.',
}

type Settings = {
  technique: string
  volume: number | null
  curl: string
  thicknessMm: number
  classicThicknessMm: number | null
  mapping: string
  lengths: number[]
  texture: string
}

const parseSettings = (raw: any): Settings | null => {
  if (!raw || typeof raw !== 'object') return null
  if (!TECHNIQUES[raw.technique] || !CURLS[raw.curl] || !MAPPINGS[raw.mapping]) return null
  const thickness = Number(raw.thicknessMm)
  if (!(thickness > 0 && thickness <= 0.3)) return null
  const volume = raw.volume == null ? null : Number(raw.volume)
  if (volume != null && !(Number.isInteger(volume) && volume >= 2 && volume <= 16)) return null
  if (!Array.isArray(raw.lengths) || raw.lengths.length < 3 || raw.lengths.length > 20) return null
  const lengths = raw.lengths.map(Number)
  if (lengths.some((mm: number) => !(mm >= 4 && mm <= 20))) return null
  const texture = TEXTURES[raw.texture] !== undefined ? raw.texture : 'none'
  const classic = raw.classicThicknessMm == null ? null : Number(raw.classicThicknessMm)
  return { technique: raw.technique, volume, curl: raw.curl, thicknessMm: thickness, classicThicknessMm: classic, mapping: raw.mapping, lengths, texture }
}

const buildPrompt = (s: Settings, eyes: number) => {
  const lengths = s.lengths.map((mm) => `${Math.round(mm)}`).join(', ')
  const thickness = s.classicThicknessMm
    ? `${s.thicknessMm.toFixed(2)} mm fibers in the fans and ${s.classicThicknessMm.toFixed(2)} mm classic lashes`
    : `${s.thicknessMm.toFixed(2)} mm fiber thickness`
  return [
    `Photorealistic beauty retouch of a real client photo. Image 1 is a close-up crop of ${eyes === 2 ? 'both eyes' : 'the eye'}.`,
    'Apply professional eyelash extensions to the UPPER lashes only.',
    `Extension specification: ${TECHNIQUES[s.technique](s.volume)}; ${CURLS[s.curl]}; ${thickness}; ${MAPPINGS[s.mapping]}.`,
    `Length map from the inner corner to the outer corner, in millimeters: ${lengths}. For scale, the iris is about 11.7 mm wide.`,
    TEXTURES[s.texture],
    'Image 2 is a rough sketch over the same crop showing where the extensions go, their lengths and directions. Follow its lengths, density and fan direction, but render real lashes: deep black, slightly glossy synthetic fibers with fine tapered tips, natural irregularity, soft depth and correct perspective for a frontal photo. The result must look like a real photograph of lash extensions, not drawn lines.',
    'Strict rules: change ONLY the upper eyelashes. Keep everything else exactly identical to Image 1: same person, same eye shape, iris and eye color, eyelids, skin texture and tone, eyebrows, makeup, lighting, white balance, sharpness, grain, framing and composition.',
    'Do not add eyeliner or makeup, do not change the lower lashes, do not move, crop, zoom or resize the image.',
  ].filter(Boolean).join('\n')
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
const decodeBase64Image = (value: unknown) => {
  if (typeof value !== 'string' || value.length < 100) return null
  const clean = value.replace(/^data:image\/\w+;base64,/, '')
  const bytes = Math.floor(clean.length * 0.75)
  if (bytes > MAX_IMAGE_BYTES) return null
  try {
    const head = atob(clean.slice(0, 16))
    const isJpeg = head.charCodeAt(0) === 0xff && head.charCodeAt(1) === 0xd8
    const isPng = head.charCodeAt(0) === 0x89 && head.slice(1, 4) === 'PNG'
    if (!isJpeg && !isPng) return null
    return { data: clean, mimeType: isJpeg ? 'image/jpeg' : 'image/png' }
  } catch {
    return null
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const callGemini = async (prompt: string, image: { data: string; mimeType: string }, guide: { data: string; mimeType: string } | null, aspectRatio: string) => {
  const parts: unknown[] = [
    { text: prompt },
    { inline_data: { mime_type: image.mimeType, data: image.data } },
  ]
  if (guide) parts.push({ inline_data: { mime_type: guide.mimeType, data: guide.data } })

  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio },
    },
  })

  const started = Date.now()
  let lastError = ''
  // Uma nova tentativa controlada só para erros temporários (429/5xx/timeout).
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = GEMINI_TIMEOUT_MS - (Date.now() - started)
    if (remaining < 8_000) break
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), remaining)
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
          body,
          signal: controller.signal,
        },
      )
      const text = await res.text()
      if (!res.ok) {
        lastError = `gemini ${res.status}: ${text.slice(0, 300)}`
        if (res.status === 429 || res.status >= 500) {
          await sleep(1500)
          continue
        }
        throw new Error(lastError)
      }
      const payload = JSON.parse(text)
      const responseParts = payload?.candidates?.[0]?.content?.parts || []
      const imagePart = responseParts.find((p: any) => p?.inlineData?.data || p?.inline_data?.data)
      const inline = imagePart?.inlineData || imagePart?.inline_data
      if (!inline?.data) {
        const reason = payload?.candidates?.[0]?.finishReason || payload?.promptFeedback?.blockReason || 'no_image'
        throw new Error(`gemini returned no image (${reason})`)
      }
      return { data: inline.data as string, mimeType: (inline.mimeType || inline.mime_type || 'image/png') as string }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (controller.signal.aborted) {
        lastError = 'gemini timeout'
        continue
      }
      throw new Error(message)
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(lastError || 'gemini failed')
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' })

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) return json(500, { ok: false, error: 'server_misconfigured' })

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json(401, { ok: false, error: 'unauthorized' })

  const sb = createClient(PROJECT_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: userData, error: userError } = await sb.auth.getUser(token)
  const userId = userData?.user?.id
  if (userError || !userId) return json(401, { ok: false, error: 'unauthorized' })

  if (!GEMINI_API_KEY) return json(503, { ok: false, error: 'ai_not_configured' })

  let body: any
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'bad_request' })
  }

  const settings = parseSettings(body?.settings)
  const image = decodeBase64Image(body?.image)
  const guide = body?.guide ? decodeBase64Image(body.guide) : null
  const aspectRatio = ASPECT_RATIOS.has(body?.aspectRatio) ? body.aspectRatio : '16:9'
  const eyes = body?.eyes === 1 ? 1 : 2
  if (!settings || !image) return json(400, { ok: false, error: 'bad_request' })

  const { data: reservation, error: reserveError } = await sb.rpc('lash_simulator_ai_reserve', {
    p_user_id: userId,
    p_model: GEMINI_MODEL,
  })
  if (reserveError) {
    console.error('[lash-simulator-ai] reserve failed', reserveError.message)
    return json(500, { ok: false, error: 'server_error' })
  }
  if (!reservation?.ok) {
    const reason = String(reservation?.reason || 'denied')
    const status = reason === 'not_lash' ? 403 : 429
    return json(status, { ok: false, error: reason, limit: reservation?.limit ?? null })
  }

  const started = Date.now()
  try {
    const result = await callGemini(buildPrompt(settings, eyes), image, guide, aspectRatio)
    await sb.rpc('lash_simulator_ai_finish', { p_id: reservation.id, p_ok: true, p_error: null, p_duration_ms: Date.now() - started })
    return json(200, {
      ok: true,
      image: result.data,
      mimeType: result.mimeType,
      used: reservation.used,
      limit: reservation.limit,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[lash-simulator-ai] generation failed', message)
    await sb.rpc('lash_simulator_ai_finish', { p_id: reservation.id, p_ok: false, p_error: message, p_duration_ms: Date.now() - started })
    return json(502, { ok: false, error: 'generation_failed' })
  }
})
