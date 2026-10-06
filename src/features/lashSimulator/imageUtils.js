// Validação, carregamento e compressão de imagens do simulador.

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const ACCEPT_ATTR = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
/** Lado maior usado no processamento: nítido para os fios, leve para o celular. */
export const PROCESSING_MAX_SIDE = 1600

const EXTENSION_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export class ImageInputError extends Error {}

/** Valida formato e tamanho antes de abrir o arquivo. */
export const validateImageFile = (file) => {
  if (!file) throw new ImageInputError('Selecione uma foto.')
  const extension = String(file.name || '').split('.').pop().toLowerCase()
  const type = file.type || EXTENSION_TYPES[extension] || ''
  if (!ACCEPTED_TYPES.includes(type)) {
    throw new ImageInputError('Formato não suportado. Envie uma foto em JPG, JPEG, PNG ou WEBP.')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageInputError('A foto é muito grande (máximo 15 MB). Envie uma imagem menor.')
  }
  if (file.size < 1024) {
    throw new ImageInputError('Não conseguimos ler esta foto. Tente outra imagem.')
  }
}

const loadImageElement = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => resolve(img)
  img.onerror = () => reject(new ImageInputError('Não conseguimos abrir esta foto. Tente outra imagem.'))
  img.src = src
})

/**
 * Desenha a imagem num canvas limitado a PROCESSING_MAX_SIDE.
 * O <img> já aplica a orientação EXIF (fotos de celular ficam em pé).
 */
const toProcessingCanvas = (img) => {
  const naturalW = img.naturalWidth || img.width
  const naturalH = img.naturalHeight || img.height
  if (!naturalW || !naturalH) throw new ImageInputError('Não conseguimos abrir esta foto. Tente outra imagem.')
  if (Math.min(naturalW, naturalH) < 320) {
    throw new ImageInputError('A foto tem resolução muito baixa. Use uma imagem com pelo menos 320 px.')
  }
  const ratio = Math.min(1, PROCESSING_MAX_SIDE / Math.max(naturalW, naturalH))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(naturalW * ratio)
  canvas.height = Math.round(naturalH * ratio)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

export const loadImageFromFile = async (file) => {
  validateImageFile(file)
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImageElement(url)
    return toProcessingCanvas(img)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const loadImageFromUrl = async (src) => {
  const img = await loadImageElement(src)
  return toProcessingCanvas(img)
}

export const canvasToBlob = (canvas, type = 'image/jpeg', quality = 0.9) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), type, quality)
  })

const pad = (n) => String(n).padStart(2, '0')

export const buildDownloadName = (date = new Date()) =>
  `simulacao-cilios-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.jpg`

/** Baixa o resultado; no celular, oferece o compartilhamento nativo quando disponível. */
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const canShareFiles = (file) => {
  try {
    return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}
