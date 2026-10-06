// Catálogo profissional do Simulador de Cílios.
//
// Técnica, quantidade de fios (D), curvatura, espessura e mapeamento são categorias
// INDEPENDENTES. Cada uma tem sua própria lista; as regras de compatibilidade entre
// elas ficam nas funções get*Options abaixo. Para adicionar uma técnica, curvatura,
// espessura ou mapeamento novo basta acrescentar um item na lista correspondente.

export const SETTINGS_VERSION = 1

// ─── Comprimentos (mm) ────────────────────────────────────────────────────────
export const LENGTH_MIN_MM = 6
export const LENGTH_MAX_MM = 15
export const LENGTH_OPTIONS_MM = Array.from(
  { length: LENGTH_MAX_MM - LENGTH_MIN_MM + 1 },
  (_, i) => LENGTH_MIN_MM + i,
)

/** Regiões do mapeamento, do canto interno (0) ao canto externo (último). */
export const MAPPING_ZONES = 9

// ─── Espessuras (mm) ──────────────────────────────────────────────────────────
export const THICKNESS_OPTIONS_MM = [0.03, 0.05, 0.06, 0.07, 0.10, 0.12, 0.15, 0.18, 0.20]

export const formatThickness = (mm) =>
  `${Number(mm).toFixed(2).replace('.', ',')} mm`

// ─── Quantidade de fios por leque (D) ─────────────────────────────────────────
export const VOLUME_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 10]

export const formatVolume = (d) => `${d}D`

// ─── Curvaturas ───────────────────────────────────────────────────────────────
// render.curlDeg: quanto o fio gira (graus) da base até a ponta.
// render.baseElevation: ângulo (graus) com que o fio sai da pálpebra, acima da
//   direção da câmera. Fios de curvatura L saem mais retos e dobram depois.
// render.kink: 0 = curva contínua (B…D); >0 = posição (0–1) da dobra (L / L+).
export const CURLS = [
  { id: 'B', label: 'B', description: 'Curvatura suave, efeito bem natural.', render: { curlDeg: 38, baseElevation: 16, kink: 0 } },
  { id: 'C', label: 'C', description: 'Curvatura média, a mais usada no dia a dia.', render: { curlDeg: 54, baseElevation: 18, kink: 0 } },
  { id: 'CC', label: 'CC', description: 'Entre C e D: mais elevação sem exagero.', render: { curlDeg: 62, baseElevation: 19, kink: 0 } },
  { id: 'D', label: 'D', description: 'Curvatura acentuada, olhar bem aberto.', render: { curlDeg: 72, baseElevation: 20, kink: 0 } },
  { id: 'L', label: 'L', description: 'Base reta com elevação na ponta. Indicada para olhos encapuzados ou cílios retos.', render: { curlDeg: 62, baseElevation: 12, kink: 0.42 } },
  { id: 'L+', label: 'L+', description: 'Como a L, com dobra ainda mais marcada.', render: { curlDeg: 70, baseElevation: 12, kink: 0.36 } },
]

// ─── Técnicas / Modelos de fio ────────────────────────────────────────────────
// fiber: como o leque é formado — define o desenho na simulação.
//   classic  → 1 fio por fio natural
//   y        → fio tecnológico em Y (2 pontas)
//   w        → fio tecnológico em W (pontas unidas na base)
//   prefab   → leque tecnológico pré-montado
//   handmade → leque montado à mão pela profissional
//   hybrid   → mistura de fio a fio com leques
// volumes: null quando a quantidade de fios não se aplica.
// combos: espessura → quantidades (D) compatíveis. Sem D: lista de espessuras.
export const TECHNIQUES = [
  {
    id: 'fio_a_fio',
    label: 'Fio a Fio',
    description: 'Um fio sintético aplicado em cada fio natural. Resultado clássico e natural.',
    fiber: 'classic',
    volumes: null,
    thicknesses: [0.10, 0.12, 0.15, 0.18, 0.20],
    defaults: { thicknessMm: 0.15 },
    render: { spread: 0, density: 1, liner: 0.35 },
  },
  {
    id: 'volume_brasileiro',
    label: 'Volume Brasileiro',
    description: 'Fio tecnológico em formato Y (2 pontas) em cada fio natural. Volume leve.',
    fiber: 'y',
    volumes: [2],
    combos: { 0.05: [2], 0.07: [2] },
    defaults: { volume: 2, thicknessMm: 0.07 },
    render: { spread: 13, stem: 0.22, density: 1, liner: 0.5 },
  },
  {
    id: 'volume_russo',
    label: 'Volume Russo',
    description: 'Leques montados à mão com fios ultrafinos. Volume denso e macio.',
    fiber: 'handmade',
    volumes: [2, 3, 4, 5, 6],
    combos: { 0.03: [4, 5, 6], 0.05: [3, 4, 5, 6], 0.06: [2, 3, 4, 5], 0.07: [2, 3, 4] },
    defaults: { volume: 4, thicknessMm: 0.06 },
    render: { spread: 'byVolume', stem: 0.04, density: 1, liner: 0.75 },
  },
  {
    id: 'volume_egipcio',
    label: 'Volume Egípcio',
    description: 'Fio tecnológico em W com pontas unidas na base. Efeito marcado e definido.',
    fiber: 'w',
    volumes: [3, 4, 5, 6],
    combos: { 0.05: [3, 4, 5, 6], 0.07: [3, 4, 5, 6] },
    defaults: { volume: 3, thicknessMm: 0.07 },
    render: { spread: 'byVolume', stem: 0.14, density: 1, liner: 0.7 },
  },
  {
    id: 'volume_ingles',
    label: 'Volume Inglês',
    description: 'Leque tecnológico pré-montado a partir de 4D. Volume médio a intenso.',
    fiber: 'prefab',
    volumes: [4, 5, 6],
    combos: { 0.05: [4, 5, 6], 0.07: [4, 5, 6] },
    defaults: { volume: 4, thicknessMm: 0.07 },
    render: { spread: 'byVolume', stem: 0.08, density: 1, liner: 0.75 },
  },
  {
    // A nomenclatura "Volume Árabe" varia entre cursos e marcas. Aqui segue a definição
    // mais comum no mercado: leques pré-montados (W/V) concentrados na base, com efeito
    // de delineado marcado.
    id: 'volume_arabe',
    label: 'Volume Árabe',
    description: 'Leques pré-montados concentrados na base, com efeito delineado marcado.',
    fiber: 'w',
    volumes: [3, 4, 5],
    combos: { 0.05: [3, 4, 5], 0.07: [3, 4, 5] },
    defaults: { volume: 3, thicknessMm: 0.07 },
    render: { spread: 'byVolume', stem: 0.18, density: 1.15, liner: 1 },
  },
  {
    id: 'volume_hibrido',
    label: 'Volume Híbrido',
    description: 'Mistura de fio a fio com leques de volume. Resultado texturizado.',
    fiber: 'hybrid',
    volumes: [2, 3, 4],
    combos: { 0.05: [3, 4], 0.06: [2, 3, 4], 0.07: [2, 3, 4] },
    classicThicknesses: [0.10, 0.12, 0.15],
    defaults: { volume: 3, thicknessMm: 0.07, classicThicknessMm: 0.15 },
    render: { spread: 'byVolume', stem: 0.04, density: 1, liner: 0.6, classicRatio: 0.5 },
  },
  {
    id: 'mega_volume',
    label: 'Mega Volume',
    description: 'Leques com muitos fios ultrafinos. Olhar dramático e bem preenchido.',
    fiber: 'handmade',
    volumes: [7, 8, 10],
    combos: { 0.03: [7, 8, 10], 0.05: [7] },
    defaults: { volume: 8, thicknessMm: 0.03 },
    render: { spread: 'byVolume', stem: 0.04, density: 1.05, liner: 1 },
  },
]

// ─── Mapeamentos ──────────────────────────────────────────────────────────────
// offsets: diferença (mm) de cada região em relação ao comprimento principal,
// do canto interno ao externo. texture: picos de comprimento (efeito Kim K / Wispy).
export const TEXTURES = {
  none: { id: 'none', label: 'Sem picos' },
  kimk: { id: 'kimk', label: 'Picos espaçados (Kim K)', spikeExtraMm: 3, spacing: 0.11, start: 0.2, thicken: 1.6 },
  wispy: { id: 'wispy', label: 'Picos frequentes (Wispy)', spikeExtraMm: 2, spacing: 0.065, start: 0.12, thicken: 1.25 },
}

export const MAPPINGS = [
  {
    id: 'natural',
    label: 'Natural',
    description: 'Distribuição equilibrada que acompanha o crescimento natural dos fios.',
    offsets: [-4, -3, -2, -1, -1, 0, 0, -1, -1],
    texture: 'none',
  },
  {
    id: 'boneca',
    label: 'Boneca',
    description: 'Maior comprimento no centro do olho, arredondando o olhar.',
    offsets: [-4, -3, -2, -1, 0, -1, -2, -3, -3],
    texture: 'none',
  },
  {
    id: 'gatinho',
    label: 'Gatinho',
    description: 'Aumento progressivo do canto interno até o canto externo.',
    offsets: [-5, -4, -3, -3, -2, -1, -1, 0, 0],
    texture: 'none',
  },
  {
    id: 'esquilo',
    label: 'Esquilo',
    description: 'Pico de comprimento antes do canto externo, que volta a diminuir.',
    offsets: [-6, -5, -4, -3, -2, -1, 0, -1, -2],
    texture: 'none',
  },
  {
    id: 'raposa',
    label: 'Raposa (Fox)',
    description: 'Fios curtos até o meio e salto no terço externo, alongando e levantando o olhar. Combina com curvatura L ou L+.',
    offsets: [-5, -5, -5, -4, -4, -3, -1, 0, 0],
    texture: 'none',
  },
  {
    id: 'olhar_aberto',
    label: 'Olhar Aberto',
    description: 'Destaque amplo na região central, abrindo o olhar na vertical.',
    offsets: [-3, -2, -1, 0, 0, 0, -1, -1, -2],
    texture: 'none',
  },
  {
    id: 'kim_k',
    label: 'Kim K',
    description: 'Base mais curta com picos longos e espaçados, efeito texturizado.',
    offsets: [-6, -5, -4, -4, -3, -3, -3, -3, -4],
    texture: 'kimk',
  },
  {
    id: 'wispy',
    label: 'Wispy',
    description: 'Picos frequentes de comprimento, efeito leve e esvoaçante.',
    offsets: [-5, -4, -3, -3, -2, -2, -2, -2, -3],
    texture: 'wispy',
  },
  {
    id: 'personalizado',
    label: 'Personalizado',
    description: 'Você define o comprimento de cada região do olho.',
    offsets: null,
    texture: null,
  },
]

export const CUSTOM_MAPPING_ID = 'personalizado'
export const DEFAULT_PEAK_MM = 12

// ─── Lookups ──────────────────────────────────────────────────────────────────
export const getTechnique = (id) => TECHNIQUES.find((t) => t.id === id) || TECHNIQUES[0]
export const getCurl = (id) => CURLS.find((c) => c.id === id) || CURLS[1]
export const getMapping = (id) => MAPPINGS.find((m) => m.id === id) || MAPPINGS[0]
export const getTexture = (id) => TEXTURES[id] || TEXTURES.none

const sortNumbers = (list) => [...list].sort((a, b) => a - b)

/** Quantidades (D) disponíveis para a técnica. Vazio = não se aplica (Fio a Fio). */
export const getVolumeOptions = (techniqueId) => getTechnique(techniqueId).volumes || []

/** Espessuras compatíveis com a técnica e, quando houver, com a quantidade de fios. */
export const getThicknessOptions = (techniqueId, volume) => {
  const technique = getTechnique(techniqueId)
  if (!technique.volumes) return sortNumbers(technique.thicknesses)
  return sortNumbers(
    Object.entries(technique.combos)
      .filter(([, volumes]) => volume == null || volumes.includes(volume))
      .map(([mm]) => Number(mm)),
  )
}

export const getClassicThicknessOptions = (techniqueId) => getTechnique(techniqueId).classicThicknesses || []

const clampLength = (mm) => Math.min(LENGTH_MAX_MM, Math.max(LENGTH_MIN_MM, Math.round(mm)))

/** Comprimentos (mm) por região para um mapeamento pronto e um comprimento principal. */
export const buildMappingLengths = (mappingId, peakMm = DEFAULT_PEAK_MM) => {
  const mapping = getMapping(mappingId)
  const offsets = mapping.offsets || getMapping('natural').offsets
  return offsets.map((offset) => clampLength(peakMm + offset))
}

export const normalizeLengths = (lengths) => {
  if (!Array.isArray(lengths) || lengths.length !== MAPPING_ZONES) {
    return buildMappingLengths('natural', DEFAULT_PEAK_MM)
  }
  return lengths.map((mm) => clampLength(Number(mm) || DEFAULT_PEAK_MM))
}

const pickClosest = (options, value) => {
  if (!options.length) return null
  if (options.includes(value)) return value
  return options.reduce((best, option) =>
    Math.abs(option - value) < Math.abs(best - value) ? option : best, options[0])
}

export const createDefaultSettings = () => {
  const technique = getTechnique('volume_russo')
  return normalizeSettings({
    technique: technique.id,
    volume: technique.defaults.volume,
    curl: 'C',
    thicknessMm: technique.defaults.thicknessMm,
    classicThicknessMm: null,
    mapping: 'natural',
    peakMm: DEFAULT_PEAK_MM,
    lengths: buildMappingLengths('natural', DEFAULT_PEAK_MM),
    texture: 'none',
  })
}

/**
 * Garante uma combinação tecnicamente coerente: troca D/espessura incompatíveis
 * pelo valor válido mais próximo em vez de deixar combinações impossíveis.
 */
export const normalizeSettings = (input = {}) => {
  const technique = getTechnique(input.technique)
  const volumes = getVolumeOptions(technique.id)
  const volume = volumes.length
    ? pickClosest(volumes, Number(input.volume) || technique.defaults.volume)
    : null
  const thicknessOptions = getThicknessOptions(technique.id, volume)
  const thicknessMm = pickClosest(thicknessOptions, Number(input.thicknessMm) || technique.defaults.thicknessMm)
  const classicOptions = getClassicThicknessOptions(technique.id)
  const classicThicknessMm = classicOptions.length
    ? pickClosest(classicOptions, Number(input.classicThicknessMm) || technique.defaults.classicThicknessMm)
    : null
  const mapping = getMapping(input.mapping)
  const peakMm = clampLength(Number(input.peakMm) || DEFAULT_PEAK_MM)
  const lengths = mapping.offsets ? buildMappingLengths(mapping.id, peakMm) : normalizeLengths(input.lengths)
  const texture = mapping.offsets ? mapping.texture : getTexture(input.texture).id

  return {
    technique: technique.id,
    volume,
    curl: getCurl(input.curl).id,
    thicknessMm,
    classicThicknessMm,
    mapping: mapping.id,
    peakMm,
    lengths,
    texture,
  }
}

/** Texto curto com a configuração completa, ex.: "Volume Russo · 5D · D · 0,07 mm · Raposa (Fox)". */
export const describeSettings = (settings) => {
  const parts = [getTechnique(settings.technique).label]
  if (settings.volume) parts.push(formatVolume(settings.volume))
  parts.push(`Curvatura ${getCurl(settings.curl).label}`)
  parts.push(formatThickness(settings.thicknessMm))
  if (settings.classicThicknessMm) parts.push(`fio a fio ${formatThickness(settings.classicThicknessMm)}`)
  parts.push(getMapping(settings.mapping).label)
  return parts.join(' · ')
}
