// Renderizador procedural de extensões de cílios.
//
// Cada fio é desenhado individualmente a partir da linha real da pálpebra superior
// detectada na foto. A escala (mm → px) vem do diâmetro da íris, então 12 mm
// em um rosto próximo ou distante têm o tamanho proporcional correto. Somente a
// região dos cílios é desenhada: o resto da foto permanece intacto.
import { IRIS_DIAMETER_MM } from './faceAnalysis'
import {
  MAPPING_ZONES,
  getCurl,
  getTechnique,
  getTexture,
} from './catalog'

const LASH_RGB = '10, 8, 9'
const SEGMENTS = 12

// ─── Utilidades geométricas ───────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}
const DEG = Math.PI / 180

const normalize = (v) => {
  const len = Math.hypot(v.x, v.y) || 1
  return { x: v.x / len, y: v.y / len }
}

/** PRNG determinístico: a mesma foto gera sempre o mesmo padrão de fios. */
const createRandom = (seed) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Curva Catmull-Rom pelos pontos da pálpebra, reamostrada por comprimento de arco. */
const buildLidCurve = (points) => {
  const dense = []
  const p = (i) => points[clamp(i, 0, points.length - 1)]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = p(i - 1); const p1 = p(i); const p2 = p(i + 1); const p3 = p(i + 2)
    const steps = 12
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const t2 = t * t; const t3 = t2 * t
      dense.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  dense.push(points[points.length - 1])

  const cumulative = [0]
  for (let i = 1; i < dense.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y))
  }
  const total = cumulative[cumulative.length - 1] || 1

  const at = (t) => {
    const target = clamp(t, 0, 1) * total
    let i = 1
    while (i < cumulative.length - 1 && cumulative[i] < target) i++
    const span = cumulative[i] - cumulative[i - 1] || 1
    const f = (target - cumulative[i - 1]) / span
    const a = dense[i - 1]; const b = dense[i]
    return { point: { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) }, tangent: normalize({ x: b.x - a.x, y: b.y - a.y }) }
  }

  return { at, length: total }
}

/** Comprimento (mm) na posição t (0 = canto interno, 1 = externo), interpolado entre regiões. */
const lengthAt = (lengths, t) => {
  const pos = clamp(t, 0, 1) * (MAPPING_ZONES - 1)
  const i = Math.floor(pos)
  const f = smoothstep(0, 1, pos - i)
  return lerp(lengths[i], lengths[Math.min(i + 1, lengths.length - 1)], f)
}

/** Espessura visual: proporcional ao calibre do fio, com mínimo legível. */
const strokeWidth = (thicknessMm, pxPerMm) => {
  const base = Math.max(0.65, pxPerMm * 0.2)
  return Math.max(0.6, base * Math.pow(thicknessMm / 0.07, 0.6))
}

const strokeAlpha = (thicknessMm) => clamp(0.66 + thicknessMm * 1.5, 0.7, 0.92)

const fanSpread = (technique, volume) => {
  const spread = technique.render.spread
  if (typeof spread === 'number') return spread
  if (!volume || volume < 2) return 0
  if (technique.fiber === 'w') return 10 + 3.6 * volume
  if (technique.fiber === 'prefab') return 12 + 3.2 * volume
  return Math.min(48, 10 + 4 * volume)
}

// ─── Desenho de um fio (ou filamento de um leque) ─────────────────────────────
// Modelo 3D simplificado: o fio sai da pálpebra apontando para a câmera
// (elevação baixa) e gira para cima ao longo do comprimento (curvatura). O azimute
// abre o fio para os lados. Projetando na foto, a base fica comprimida (densa, como
// um delineado) e as pontas aparecem curvando — como numa foto frontal real.
const drawFilament = (ctx, {
  base, frame, azimuth, tilt, elevation, curlDeg, kink, lengthPx, width, alpha, divergeAngle = 0, stem = 0,
}) => {
  const { out } = frame
  let x = base.x
  let y = base.y
  const step = lengthPx / SEGMENTS
  for (let i = 0; i < SEGMENTS; i++) {
    const s = (i + 0.5) / SEGMENTS
    const curlProgress = kink > 0
      ? smoothstep(kink - 0.1, kink + 0.3, s)
      : Math.pow(s, 1.3)
    const diverge = divergeAngle * smoothstep(stem, stem + 0.35, s)
    const theta = (elevation + curlDeg * curlProgress) * DEG
    const phi = (azimuth + diverge) * DEG
    // "Para cima" local: inclinado para fora conforme a posição na pálpebra; o leque
    // também abre neste plano, então continua visível quando a ponta fica vertical.
    const tiltRad = (tilt + diverge * 0.8) * DEG
    const upX = frame.up.x * Math.cos(tiltRad) + out.x * Math.sin(tiltRad)
    const upY = frame.up.y * Math.cos(tiltRad) + out.y * Math.sin(tiltRad)
    const lateral = Math.cos(theta) * Math.sin(phi)
    const vertical = Math.sin(theta)
    const nx = x + (out.x * lateral + upX * vertical) * step
    const ny = y + (out.y * lateral + upY * vertical) * step
    const progress = (i + 1) / SEGMENTS
    const taper = 1 - 0.8 * Math.pow(progress, 1.2)
    ctx.strokeStyle = `rgba(${LASH_RGB}, ${alpha * (1 - 0.18 * Math.pow(progress, 2))})`
    ctx.lineWidth = Math.max(0.35, width * taper)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(nx, ny)
    ctx.stroke()
    x = nx
    y = ny
  }
}

/** Linha de base dos cílios ("efeito delineado" formado pela concentração de fios). */
const drawLashLine = (ctx, offsetAt, pxPerMm, strength) => {
  const steps = 60
  const maxWidth = pxPerMm * (0.22 + 0.32 * strength)
  for (let pass = 0; pass < 2; pass++) {
    const widthFactor = pass === 0 ? 1.8 : 1
    const alpha = pass === 0 ? 0.08 + 0.08 * strength : 0.22 + 0.25 * strength
    for (let i = 0; i < steps; i++) {
      const t0 = lerp(0.03, 0.99, i / steps)
      const t1 = lerp(0.03, 0.99, (i + 1) / steps)
      const a = offsetAt(t0)
      const b = offsetAt(t1)
      const profile = Math.pow(Math.sin(Math.PI * ((t0 + t1) / 2)), 0.35)
      ctx.strokeStyle = `rgba(${LASH_RGB}, ${alpha})`
      ctx.lineWidth = Math.max(0.5, maxWidth * widthFactor * profile * lerp(0.75, 1.1, t0))
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }
}

const spikePositions = (texture, random) => {
  if (!texture || texture.id === 'none') return []
  const spikes = []
  for (let t = texture.start; t < 0.96; t += texture.spacing) {
    spikes.push(clamp(t + (random() - 0.5) * texture.spacing * 0.25, 0.05, 0.97))
  }
  return spikes
}

// ─── Olho ─────────────────────────────────────────────────────────────────────
const drawEye = (ctx, eye, faceUp, settings, pxPerMm, random) => {
  const technique = getTechnique(settings.technique)
  const curl = getCurl(settings.curl).render
  const texture = getTexture(settings.texture)
  const curve = buildLidCurve(eye.upper)

  // Lado externo: +1 quando o canto externo está à direita do interno na imagem.
  const side = eye.outer.x >= eye.inner.x ? 1 : -1

  const normalAt = (t) => {
    const { point, tangent } = curve.at(t)
    let normal = { x: tangent.y, y: -tangent.x }
    if (normal.x * faceUp.x + normal.y * faceUp.y < 0) normal = { x: -normal.x, y: -normal.y }
    return { point, normal }
  }
  const baseOffset = pxPerMm * 0.22 + 0.6
  const offsetAt = (t, extra = 0) => {
    const { point, normal } = normalAt(t)
    return { x: point.x + normal.x * (baseOffset + extra), y: point.y + normal.y * (baseOffset + extra) }
  }

  drawLashLine(ctx, offsetAt, pxPerMm, technique.render.liner)

  const baseCount = Math.round(62 * (technique.render.density || 1))
  const spikes = spikePositions(texture, random)
  const spikeWidth = texture.spacing ? texture.spacing * 0.16 : 0
  const volume = settings.volume || 1
  const spread = fanSpread(technique, volume)
  const isHybrid = technique.fiber === 'hybrid'
  const classicRatio = technique.render.classicRatio || 0

  // Eixos da face na foto: "up" para a testa, "out" para o canto externo deste olho.
  const frame = { up: faceUp, out: { x: -faceUp.y * side, y: faceUp.x * side } }

  for (let i = 0; i < baseCount; i++) {
    const t = clamp(lerp(0.04, 0.985, (i + random()) / baseCount), 0, 1)
    const row = i % 2 === 0 ? 0 : pxPerMm * (0.08 + random() * 0.14)
    const base = offsetAt(t, row)
    const { normal } = normalAt(t)

    // Leque natural: levemente para o nariz no canto interno, bem aberto no externo.
    // azimuth abre o fio para o lado; tilt inclina o fio no plano da foto (segue a
    // pálpebra), o que mantém o leque mesmo quando a ponta fica vertical (L / L+).
    const spreadT = Math.pow(t, 1.6)
    const azimuth = -18 + 70 * spreadT + (random() - 0.5) * 12
    const tilt = -10 + 40 * spreadT + (random() - 0.5) * 8
    const elevation = curl.baseElevation + (random() - 0.5) * 8

    let lengthMm = lengthAt(settings.lengths, t)
    lengthMm *= 0.8 + 0.2 * smoothstep(0, 0.12, t)
    lengthMm *= 1 + (random() - 0.5) * 0.12

    let spikeFactor = 0
    if (spikes.length) {
      const nearest = Math.min(...spikes.map((s) => Math.abs(s - t)))
      spikeFactor = clamp(1 - nearest / spikeWidth, 0, 1)
      lengthMm += texture.spikeExtraMm * spikeFactor
    }

    const lengthPx = lengthMm * pxPerMm
    const classic = technique.fiber === 'classic' || (isHybrid && random() < classicRatio)
    const curlDeg = curl.curlDeg + (random() - 0.5) * 16
    const common = { frame, azimuth, tilt, elevation, curlDeg, kink: curl.kink }

    if (classic) {
      const thickness = isHybrid ? settings.classicThicknessMm : settings.thicknessMm
      drawFilament(ctx, {
        ...common,
        base,
        lengthPx,
        width: strokeWidth(thickness, pxPerMm) * (1 + spikeFactor * 0.3),
        alpha: strokeAlpha(thickness),
      })
      continue
    }

    // Leque: picos (Kim K / Wispy) ficam mais fechados, como fios "molhados".
    const fanSpreadHere = spread * (1 - 0.75 * spikeFactor)
    const filaments = technique.fiber === 'y' ? 2 : volume
    const thicken = 1 + (texture.thicken ? (texture.thicken - 1) * spikeFactor : 0)
    const tipJitter = technique.fiber === 'handmade' ? 0.1 : 0.04
    // Leques com muitos fios ultrafinos: cada filamento fica mais translúcido para a
    // soma não virar uma mancha sólida.
    const fanAlpha = strokeAlpha(settings.thicknessMm) * clamp(1.6 / Math.sqrt(filaments), 0.55, 1)
    for (let f = 0; f < filaments; f++) {
      const offset = filaments > 1 ? (f / (filaments - 1) - 0.5) * fanSpreadHere : 0
      const lateral = (f - (filaments - 1) / 2) * pxPerMm * 0.02
      drawFilament(ctx, {
        ...common,
        base: { x: base.x + normal.y * lateral, y: base.y - normal.x * lateral },
        lengthPx: lengthPx * (1 + (random() - 0.5) * tipJitter),
        width: strokeWidth(settings.thicknessMm, pxPerMm) * thicken,
        alpha: fanAlpha,
        divergeAngle: offset,
        stem: technique.render.stem || 0,
      })
    }
  }
}

const hashString = (value) => {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Desenha a simulação sobre a imagem e devolve um novo canvas.
 * @param {HTMLCanvasElement|ImageBitmap} image imagem original (já redimensionada)
 * @param {object} analysis resultado de analyzeFace()
 * @param {object} settings configuração normalizada (catalog.normalizeSettings)
 */
export const renderLashSimulation = (image, analysis, settings) => {
  const { width, height, eyes, up } = analysis
  const output = document.createElement('canvas')
  output.width = width
  output.height = height
  const ctx = output.getContext('2d')
  ctx.drawImage(image, 0, 0, width, height)

  const irisPx = eyes.reduce((sum, eye) => sum + eye.irisDiameterPx, 0) / eyes.length
  const pxPerMm = irisPx / IRIS_DIAMETER_MM

  // Desenha só a região dos olhos, em resolução dobrada para fios finos nítidos.
  const maxLashPx = 20 * pxPerMm
  const xs = eyes.flatMap((eye) => eye.upper.map((p) => p.x))
  const ys = eyes.flatMap((eye) => eye.upper.map((p) => p.y))
  const region = {
    x: Math.max(0, Math.floor(Math.min(...xs) - maxLashPx)),
    y: Math.max(0, Math.floor(Math.min(...ys) - maxLashPx)),
  }
  region.w = Math.min(width, Math.ceil(Math.max(...xs) + maxLashPx)) - region.x
  region.h = Math.min(height, Math.ceil(Math.max(...ys) + pxPerMm * 4)) - region.y

  const scale = region.w * region.h > 2_500_000 ? 1 : 2
  const layer = document.createElement('canvas')
  layer.width = Math.max(1, Math.round(region.w * scale))
  layer.height = Math.max(1, Math.round(region.h * scale))
  const lctx = layer.getContext('2d')
  lctx.lineCap = 'round'
  lctx.lineJoin = 'round'
  lctx.scale(scale, scale)
  lctx.translate(-region.x, -region.y)

  const seed = hashString(`${Math.round(eyes[0].inner.x)}:${Math.round(eyes[0].inner.y)}:${width}x${height}`)
  eyes.forEach((eye, index) => {
    drawEye(lctx, eye, up, settings, pxPerMm, createRandom(seed + index * 7919))
  })

  // Sombra suave dos fios sobre a pálpebra dá profundidade.
  ctx.save()
  ctx.shadowColor = 'rgba(25, 12, 14, 0.16)'
  ctx.shadowBlur = Math.max(0.8, pxPerMm * 0.18)
  ctx.shadowOffsetY = Math.max(0.5, pxPerMm * 0.1)
  ctx.drawImage(layer, region.x, region.y, region.w, region.h)
  ctx.restore()

  return output
}
