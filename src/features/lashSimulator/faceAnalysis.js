// Detecção de rosto e olhos com MediaPipe Face Landmarker, executada no próprio
// navegador (a foto não sai do aparelho). Os arquivos do modelo são servidos pelo
// próprio app — nada é baixado de terceiros durante o uso.
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'

const MODEL_PATH = '/lash-simulator/face_landmarker.task'

// Contorno da pálpebra superior/inferior, do canto interno ao externo.
// Índices da malha canônica de 478 pontos do MediaPipe (468–477 = íris).
const EYE_LANDMARKS = {
  first: {
    upper: [133, 173, 157, 158, 159, 160, 161, 246, 33],
    lower: [133, 155, 154, 153, 145, 144, 163, 7, 33],
    iris: [468, 469, 470, 471, 472],
    blink: 'eyeBlinkRight',
  },
  second: {
    upper: [362, 398, 384, 385, 386, 387, 388, 466, 263],
    lower: [362, 382, 381, 380, 374, 373, 390, 249, 263],
    iris: [473, 474, 475, 476, 477],
    blink: 'eyeBlinkLeft',
  },
}
const NOSE_TIP = 1
const FOREHEAD = 10
const CHIN = 152

// Diâmetro horizontal médio da íris humana adulta (mm) — usado como régua para
// converter milímetros do mapeamento em pixels da foto.
export const IRIS_DIAMETER_MM = 11.7

export const ANALYSIS_MESSAGES = {
  eyes: 'Não conseguimos identificar os olhos com qualidade suficiente. Tente utilizar uma foto mais frontal, bem iluminada e com os olhos visíveis.',
  no_face: 'Não encontramos um rosto nesta foto. Use uma foto frontal e próxima, com o rosto inteiro aparecendo.',
  multiple_faces: 'Encontramos mais de um rosto. Use uma foto só da cliente.',
  too_far: 'O rosto está muito distante ou pequeno na foto. Aproxime a câmera ou recorte a imagem.',
  too_dark: 'A foto está muito escura. Procure um lugar mais iluminado, de frente para a luz.',
  tilted: 'O rosto está muito inclinado ou de lado. Use uma foto mais frontal, olhando para a câmera.',
  eyes_closed: 'Os olhos parecem fechados ou parcialmente cobertos. Use uma foto com os olhos abertos e visíveis.',
  engine: 'Não conseguimos analisar esta foto agora. Verifique sua conexão e tente novamente.',
}

// Problemas na região dos olhos também recebem a orientação geral de foto.
const EYE_RELATED = new Set(['too_far', 'too_dark', 'tilted', 'eyes_closed'])

export class FaceAnalysisError extends Error {
  constructor(code, detail) {
    super(ANALYSIS_MESSAGES[code] || ANALYSIS_MESSAGES.eyes)
    this.code = code
    this.detail = detail
    this.guidance = EYE_RELATED.has(code) ? ANALYSIS_MESSAGES.eyes : ''
  }
}

let landmarkerPromise = null

const createLandmarker = async (delegate) => {
  const { FaceLandmarker } = await import('@mediapipe/tasks-vision')
  return FaceLandmarker.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'IMAGE',
      numFaces: 2,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    },
  )
}

/** Carrega o modelo uma única vez (GPU quando disponível, senão CPU). */
export const loadFaceLandmarker = () => {
  if (!landmarkerPromise) {
    landmarkerPromise = createLandmarker('GPU')
      .catch((gpuError) => {
        console.warn('[lash-simulator] GPU delegate unavailable, using CPU', gpuError)
        return createLandmarker('CPU')
      })
      .catch((error) => {
        landmarkerPromise = null
        throw error
      })
  }
  return landmarkerPromise
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

const toPx = (landmarks, width, height) => (index) => {
  const p = landmarks[index]
  return { x: p.x * width, y: p.y * height }
}

/**
 * Estatísticas de luminância de uma região. Usamos os realces (percentil 90) e o
 * contraste em vez da média: a média penalizaria peles escuras bem iluminadas.
 */
const lumaStats = (source, box) => {
  const sampleW = 64
  const sampleH = 64
  const canvas = document.createElement('canvas')
  canvas.width = sampleW
  canvas.height = sampleH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const x = Math.max(0, box.x)
  const y = Math.max(0, box.y)
  const w = Math.max(1, Math.min(box.w, source.width - x))
  const h = Math.max(1, Math.min(box.h, source.height - y))
  ctx.drawImage(source, x, y, w, h, 0, 0, sampleW, sampleH)
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH)
  const values = new Float32Array(data.length / 4)
  let sum = 0
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const v = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    values[j] = v
    sum += v
  }
  const mean = sum / values.length
  let variance = 0
  for (let j = 0; j < values.length; j++) variance += (values[j] - mean) ** 2
  values.sort()
  return {
    mean,
    p90: values[Math.floor(values.length * 0.9)],
    contrast: Math.sqrt(variance / values.length),
  }
}

const buildEye = (key, landmarks, px, blendshapes) => {
  const def = EYE_LANDMARKS[key]
  const upper = def.upper.map(px)
  const lower = def.lower.map(px)
  const irisRing = def.iris.slice(1).map(px)
  const irisCenter = px(def.iris[0])
  // Diâmetro pela média dos dois eixos do anel da íris.
  const irisDiameterPx = (dist(irisRing[0], irisRing[2]) + dist(irisRing[1], irisRing[3])) / 2
  const inner = upper[0]
  const outer = upper[upper.length - 1]
  const width = dist(inner, outer)
  // Abertura: distância entre as pálpebras na região central do olho.
  const opening = (dist(upper[4], lower[4]) + dist(upper[3], lower[3]) + dist(upper[5], lower[5])) / 3
  const blinkScore = blendshapes?.find((b) => b.categoryName === def.blink)?.score ?? 0
  return {
    upper,
    lower,
    inner,
    outer,
    width,
    irisCenter,
    irisDiameterPx,
    openness: width > 0 ? opening / width : 0,
    blinkScore,
  }
}

/**
 * Analisa a imagem e devolve a geometria dos olhos.
 * Lança FaceAnalysisError com um código amigável quando a foto não é adequada.
 */
export const analyzeFace = async (source) => {
  let landmarker
  try {
    landmarker = await loadFaceLandmarker()
  } catch (error) {
    throw new FaceAnalysisError('engine', error)
  }

  let result
  try {
    result = landmarker.detect(source)
  } catch (error) {
    throw new FaceAnalysisError('engine', error)
  }

  const width = source.width
  const height = source.height
  const faces = result?.faceLandmarks || []
  if (!faces.length) throw new FaceAnalysisError('no_face')

  const faceSize = (landmarks) => {
    const xs = landmarks.map((p) => p.x)
    return Math.max(...xs) - Math.min(...xs)
  }
  if (faces.length > 1) {
    const sizes = faces.map(faceSize).sort((a, b) => b - a)
    // Rostos bem pequenos ao fundo (pôster, foto na parede) não atrapalham.
    if (sizes[1] > sizes[0] * 0.45) throw new FaceAnalysisError('multiple_faces')
  }

  const faceIndex = faces.length > 1
    ? faces.map(faceSize).indexOf(Math.max(...faces.map(faceSize)))
    : 0
  const landmarks = faces[faceIndex]
  const blendshapes = result.faceBlendshapes?.[faceIndex]?.categories
  const px = toPx(landmarks, width, height)

  let eyeA = buildEye('first', landmarks, px, blendshapes)
  let eyeB = buildEye('second', landmarks, px, blendshapes)
  // Ordena da esquerda para a direita da imagem.
  if (eyeA.irisCenter.x > eyeB.irisCenter.x) [eyeA, eyeB] = [eyeB, eyeA]
  const eyes = [eyeA, eyeB]

  const xs = landmarks.map((p) => p.x * width)
  const ys = landmarks.map((p) => p.y * height)
  const faceBox = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  }

  // Distância: olhos pequenos demais para desenhar fios com qualidade.
  const interOcular = dist(eyeA.irisCenter, eyeB.irisCenter)
  const minIris = Math.min(eyeA.irisDiameterPx, eyeB.irisDiameterPx)
  if (minIris < 16 || interOcular < Math.min(width, height) * 0.1) {
    throw new FaceAnalysisError('too_far', { minIris, interOcular })
  }

  // Inclinação lateral (roll) e rotação (yaw).
  const roll = Math.atan2(eyeB.irisCenter.y - eyeA.irisCenter.y, eyeB.irisCenter.x - eyeA.irisCenter.x) * 180 / Math.PI
  const nose = px(NOSE_TIP)
  const dA = dist(nose, eyeA.outer)
  const dB = dist(nose, eyeB.outer)
  const yawRatio = (dA - dB) / (dA + dB)
  const forehead = px(FOREHEAD)
  const chin = px(CHIN)
  const eyeMidY = (eyeA.irisCenter.y + eyeB.irisCenter.y) / 2
  const pitchRatio = (nose.y - eyeMidY) / Math.max(1, chin.y - forehead.y)
  if (Math.abs(roll) > 25 || Math.abs(yawRatio) > 0.22 || pitchRatio < 0.08 || pitchRatio > 0.32) {
    throw new FaceAnalysisError('tilted', { roll, yawRatio, pitchRatio })
  }

  // Olhos fechados ou cobertos.
  const closed = eyes.some((eye) => eye.blinkScore > 0.55 || eye.openness < 0.14)
  if (closed) {
    throw new FaceAnalysisError('eyes_closed', eyes.map((e) => ({ blink: e.blinkScore, openness: e.openness })))
  }

  // Iluminação: rosto inteiro e região dos olhos.
  const faceLight = lumaStats(source, faceBox)
  const eyeBox = {
    x: Math.min(eyeA.outer.x, eyeA.inner.x) - eyeA.width * 0.3,
    y: Math.min(eyeA.irisCenter.y, eyeB.irisCenter.y) - eyeA.width * 0.6,
    w: (Math.max(eyeB.outer.x, eyeB.inner.x) - Math.min(eyeA.outer.x, eyeA.inner.x)) + eyeA.width * 0.6,
    h: eyeA.width * 1.2,
  }
  const eyeLight = lumaStats(source, eyeBox)
  if (faceLight.p90 < 80 || eyeLight.p90 < 70 || eyeLight.contrast < 9) {
    throw new FaceAnalysisError('too_dark', { faceLight, eyeLight })
  }

  // Vetor "para cima" do rosto (perpendicular à linha dos olhos).
  const ax = eyeB.irisCenter.x - eyeA.irisCenter.x
  const ay = eyeB.irisCenter.y - eyeA.irisCenter.y
  const len = Math.hypot(ax, ay) || 1
  const up = { x: ay / len, y: -ax / len }
  if (up.y > 0) { up.x = -up.x; up.y = -up.y }

  return {
    width,
    height,
    eyes,
    up,
    faceBox,
    pose: { roll, yawRatio, pitchRatio },
    quality: { face: faceLight, eyes: eyeLight },
  }
}
