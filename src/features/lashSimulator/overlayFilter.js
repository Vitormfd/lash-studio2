// Modo "Filtro manual": cílios prontos (PNG transparente) sobrepostos à foto.
//
// Cada filtro é uma fileira de cílios de UM olho (canto interno à esquerda, externo
// à direita) com dois pontos de encaixe na raiz (interno e externo), definidos em
// public/lash-simulator/overlays/manifest.json. O encaixe inicial usa os cantos do
// olho detectados pelo MediaPipe; depois a profissional ajusta com o dedo.

const MANIFEST_URL = '/lash-simulator/overlays/manifest.json'

export const DEFAULT_ADJUSTMENT = { dx: 0, dy: 0, scale: 1, rotate: 0 }

let manifestPromise = null
const imageCache = new Map()

/** Lista de filtros publicados. Lista vazia se ainda não houver nenhum. */
export const loadOverlayManifest = () => {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL, { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : { overlays: [] }))
      .then((data) => (Array.isArray(data?.overlays) ? data.overlays.filter((o) => o?.id && o?.file && o?.anchors) : []))
      .catch(() => [])
      .then((list) => {
        if (!list.length) manifestPromise = null
        return list
      })
  }
  return manifestPromise
}

export const loadOverlayImage = (src) => {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve, reject) => {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => resolve(img)
      img.onerror = () => {
        imageCache.delete(src)
        reject(new Error(`overlay load failed: ${src}`))
      }
      img.src = src
    }))
  }
  return imageCache.get(src)
}

const eyeTargets = (eye) => ({ inner: eye.upper[0], outer: eye.upper[eye.upper.length - 1] })

/** Centro de referência do olho (meio da linha dos cílios) para girar/escalar. */
export const eyePivot = (eye) => {
  const { inner, outer } = eyeTargets(eye)
  return { x: (inner.x + outer.x) / 2, y: (inner.y + outer.y) / 2 }
}

/**
 * Matriz que leva o PNG do filtro até o olho: encaixe automático pelos cantos
 * + ajuste manual (deslocamento, tamanho, rotação em torno do centro do olho).
 */
export const overlayMatrix = (eye, overlay, image, adjustment = DEFAULT_ADJUSTMENT) => {
  const w = image.naturalWidth || image.width
  const h = image.naturalHeight || image.height
  const mirror = eye.outer.x < eye.inner.x
  const ai = { x: overlay.anchors.inner[0] * w, y: overlay.anchors.inner[1] * h }
  const ao = { x: overlay.anchors.outer[0] * w, y: overlay.anchors.outer[1] * h }
  if (mirror) {
    ai.x = w - ai.x
    ao.x = w - ao.x
  }
  const { inner, outer } = eyeTargets(eye)
  const scale = Math.hypot(outer.x - inner.x, outer.y - inner.y) / Math.max(1, Math.hypot(ao.x - ai.x, ao.y - ai.y))
  const angle = Math.atan2(outer.y - inner.y, outer.x - inner.x) - Math.atan2(ao.y - ai.y, ao.x - ai.x)

  let base = new DOMMatrix()
  base = base.translate(inner.x, inner.y).rotate((angle * 180) / Math.PI).scale(scale).translate(-ai.x, -ai.y)
  if (mirror) base = base.multiply(new DOMMatrix([-1, 0, 0, 1, w, 0]))

  const pivot = eyePivot(eye)
  const adj = { ...DEFAULT_ADJUSTMENT, ...adjustment }
  const manual = new DOMMatrix()
    .translate(pivot.x + adj.dx, pivot.y + adj.dy)
    .rotate(adj.rotate)
    .scale(adj.scale)
    .translate(-pivot.x, -pivot.y)
  return manual.multiply(base)
}

/**
 * Desenha a foto com o filtro nos dois olhos.
 * `multiply` faz os fios herdarem a luz e o tom da foto (não ficam "colados").
 */
export const drawFilteredPhoto = (ctx, original, analysis, overlay, image, adjustments, { scale = 1, opacity = 0.96 } = {}) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(original, 0, 0, analysis.width * scale, analysis.height * scale)
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = opacity
  analysis.eyes.forEach((eye, index) => {
    const m = overlayMatrix(eye, overlay, image, adjustments[index])
    ctx.setTransform(new DOMMatrix().scale(scale).multiply(m))
    ctx.drawImage(image, 0, 0)
  })
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

export const renderFilteredPhoto = (original, analysis, overlay, image, adjustments, options) => {
  const canvas = document.createElement('canvas')
  canvas.width = analysis.width
  canvas.height = analysis.height
  drawFilteredPhoto(canvas.getContext('2d'), original, analysis, overlay, image, adjustments, options)
  return canvas
}

/** Índice do olho mais próximo de um ponto (coordenadas da foto). */
export const nearestEye = (analysis, point) => {
  let best = 0
  let bestDist = Infinity
  analysis.eyes.forEach((eye, index) => {
    const p = eyePivot(eye)
    const d = Math.hypot(p.x - point.x, p.y - point.y)
    if (d < bestDist) { bestDist = d; best = index }
  })
  return best
}
