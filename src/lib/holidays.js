/** Feriados brasileiros — nacionais, estaduais e municipais (principais). */

export const BRAZIL_STATES = [
  { uf: 'AC', name: 'Acre' },
  { uf: 'AL', name: 'Alagoas' },
  { uf: 'AP', name: 'Amapá' },
  { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' },
  { uf: 'CE', name: 'Ceará' },
  { uf: 'DF', name: 'Distrito Federal' },
  { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'MA', name: 'Maranhão' },
  { uf: 'MT', name: 'Mato Grosso' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' },
  { uf: 'PA', name: 'Pará' },
  { uf: 'PB', name: 'Paraíba' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' },
  { uf: 'PI', name: 'Piauí' },
  { uf: 'RJ', name: 'Rio de Janeiro' },
  { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' },
  { uf: 'RO', name: 'Rondônia' },
  { uf: 'RR', name: 'Roraima' },
  { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'SE', name: 'Sergipe' },
  { uf: 'TO', name: 'Tocantins' },
]

const pad2 = (n) => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`

/** Algoritmo de Meeus/Jones/Butcher — Páscoa ocidental. */
export const easterDate = (year) => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const addDays = (date, days) => {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const toYmd = (date) => ymd(date.getFullYear(), date.getMonth() + 1, date.getDate())

export const normalizeCityKey = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const nationalFixed = (year) => [
  { date: ymd(year, 1, 1), name: 'Ano Novo', type: 'national' },
  { date: ymd(year, 4, 21), name: 'Tiradentes', type: 'national' },
  { date: ymd(year, 5, 1), name: 'Dia do Trabalho', type: 'national' },
  { date: ymd(year, 9, 7), name: 'Independência do Brasil', type: 'national' },
  { date: ymd(year, 10, 12), name: 'Nossa Senhora Aparecida', type: 'national' },
  { date: ymd(year, 11, 2), name: 'Finados', type: 'national' },
  { date: ymd(year, 11, 15), name: 'Proclamação da República', type: 'national' },
  { date: ymd(year, 11, 20), name: 'Dia da Consciência Negra', type: 'national' },
  { date: ymd(year, 12, 25), name: 'Natal', type: 'national' },
]

const nationalMovable = (year) => {
  const easter = easterDate(year)
  return [
    { date: toYmd(addDays(easter, -48)), name: 'Carnaval', type: 'national' },
    { date: toYmd(addDays(easter, -47)), name: 'Carnaval', type: 'national' },
    { date: toYmd(addDays(easter, -2)), name: 'Sexta-feira Santa', type: 'national' },
    { date: toYmd(addDays(easter, 60)), name: 'Corpus Christi', type: 'national' },
  ]
}

/** Feriados estaduais fixos (MM-DD). Alguns estados têm móveis raros; cobrimos o usual. */
const STATE_FIXED = {
  AC: [
    { md: '01-23', name: 'Dia do Evangélico' },
    { md: '06-15', name: 'Aniversário do Acre' },
    { md: '09-05', name: 'Dia da Amazônia' },
    { md: '11-17', name: 'Assinatura do Tratado de Petrópolis' },
  ],
  AL: [
    { md: '06-24', name: 'São João' },
    { md: '06-29', name: 'São Pedro' },
    { md: '09-16', name: 'Emancipação Política de Alagoas' },
  ],
  AP: [
    { md: '03-19', name: 'Dia de São José' },
    { md: '09-13', name: 'Criação do Território Federal do Amapá' },
  ],
  AM: [
    { md: '09-05', name: 'Elevação do Amazonas à categoria de Província' },
    { md: '12-08', name: 'Nossa Senhora da Conceição' },
  ],
  BA: [{ md: '07-02', name: 'Independência da Bahia' }],
  CE: [{ md: '03-25', name: 'Data Magna do Ceará' }],
  DF: [
    { md: '04-21', name: 'Fundação de Brasília' },
    { md: '11-30', name: 'Dia do Evangélico' },
  ],
  ES: [],
  GO: [{ md: '10-24', name: 'Pedra Fundamental de Goiânia' }],
  MA: [{ md: '07-28', name: 'Adesão do Maranhão à Independência' }],
  MT: [],
  MS: [{ md: '10-11', name: 'Criação do Estado de Mato Grosso do Sul' }],
  MG: [{ md: '04-21', name: 'Data Magna de Minas Gerais' }],
  PA: [{ md: '08-15', name: 'Adesão do Pará à Independência' }],
  PB: [{ md: '08-05', name: 'Fundação do Estado da Paraíba' }],
  PR: [{ md: '12-19', name: 'Emancipação Política do Paraná' }],
  PE: [
    { md: '03-06', name: 'Revolução Pernambucana' },
    { md: '06-24', name: 'São João' },
  ],
  PI: [{ md: '10-19', name: 'Dia do Piauí' }],
  RJ: [{ md: '04-23', name: 'São Jorge' }],
  RN: [{ md: '10-03', name: 'Mártires de Cunhaú e Uruaçu' }],
  RS: [{ md: '09-20', name: 'Revolução Farroupilha' }],
  RO: [
    { md: '01-04', name: 'Criação do Estado de Rondônia' },
    { md: '06-18', name: 'Dia do Evangélico' },
  ],
  RR: [{ md: '10-05', name: 'Criação do Estado de Roraima' }],
  SC: [{ md: '08-11', name: 'Criação da Capitania de Santa Catarina' }],
  SP: [{ md: '07-09', name: 'Revolução Constitucionalista' }],
  SE: [{ md: '07-08', name: 'Emancipação Política de Sergipe' }],
  TO: [
    { md: '03-18', name: 'Autonomia do Tocantins' },
    { md: '09-08', name: 'Nossa Senhora da Natividade' },
    { md: '10-05', name: 'Criação do Estado do Tocantins' },
  ],
}

/**
 * Feriados municipais das principais cidades (aniversário da cidade e outros comuns).
 * Chave: `${UF}|${normalizeCityKey(nome)}`
 */
const CITY_FIXED = {
  'SP|sao paulo': [
    { md: '01-25', name: 'Aniversário de São Paulo' },
  ],
  'RJ|rio de janeiro': [
    { md: '01-20', name: 'São Sebastião' },
    { md: '03-01', name: 'Aniversário do Rio de Janeiro' },
  ],
  'MG|belo horizonte': [
    { md: '12-08', name: 'Nossa Senhora da Conceição / Aniversário de BH' },
  ],
  'RS|porto alegre': [
    { md: '03-26', name: 'Aniversário de Porto Alegre' },
  ],
  'PR|curitiba': [
    { md: '09-08', name: 'Nossa Senhora da Luz dos Pinhais' },
  ],
  'BA|salvador': [
    { md: '06-24', name: 'São João' },
    { md: '12-08', name: 'Nossa Senhora da Conceição da Praia' },
  ],
  'PE|recife': [
    { md: '03-12', name: 'Emancipação Política de Recife' },
    { md: '06-24', name: 'São João' },
  ],
  'CE|fortaleza': [
    { md: '04-13', name: 'Aniversário de Fortaleza' },
  ],
  'DF|brasilia': [
    { md: '04-21', name: 'Fundação de Brasília' },
  ],
  'GO|goiania': [
    { md: '10-24', name: 'Aniversário de Goiânia' },
  ],
  'SC|florianopolis': [
    { md: '03-23', name: 'Aniversário de Florianópolis' },
  ],
  'AM|manaus': [
    { md: '10-24', name: 'Aniversário de Manaus' },
  ],
  'PA|belem': [
    { md: '01-12', name: 'Aniversário de Belém' },
    { md: '10-08', name: 'Cirio de Nazaré (ponto facultativo comum)' },
  ],
  'ES|vitoria': [
    { md: '09-08', name: 'Nossa Senhora da Vitória' },
  ],
  'MT|cuiaba': [
    { md: '04-08', name: 'Aniversário de Cuiabá' },
  ],
  'MS|campo grande': [
    { md: '08-26', name: 'Aniversário de Campo Grande' },
  ],
  'AL|maceio': [
    { md: '12-08', name: 'Nossa Senhora dos Prazeres / Aniversário de Maceió' },
  ],
  'PB|joao pessoa': [
    { md: '08-05', name: 'Aniversário de João Pessoa' },
  ],
  'RN|natal': [
    { md: '01-06', name: 'Reis Magos / Aniversário de Natal' },
  ],
  'SE|aracaju': [
    { md: '03-17', name: 'Aniversário de Aracaju' },
  ],
  'PI|teresina': [
    { md: '08-16', name: 'Aniversário de Teresina' },
  ],
  'MA|sao luis': [
    { md: '09-08', name: 'Aniversário de São Luís' },
  ],
  'RO|porto velho': [
    { md: '10-02', name: 'Aniversário de Porto Velho' },
  ],
  'AC|rio branco': [
    { md: '12-28', name: 'Aniversário de Rio Branco' },
  ],
  'RR|boa vista': [
    { md: '07-09', name: 'Aniversário de Boa Vista' },
  ],
  'AP|macapa': [
    { md: '02-04', name: 'Aniversário de Macapá' },
  ],
  'TO|palmas': [
    { md: '05-20', name: 'Aniversário de Palmas' },
  ],
}

const TYPE_LABEL = {
  national: 'Nacional',
  state: 'Estadual',
  municipal: 'Municipal',
}

export const holidayTypeLabel = (type) => TYPE_LABEL[type] || type

const dedupeByDateName = (list) => {
  const seen = new Set()
  return list.filter((h) => {
    const key = `${h.date}|${h.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Lista feriados do ano para a localização informada.
 * @param {number} year
 * @param {{ stateUf?: string, city?: string }} location
 */
export const getHolidaysForYear = (year, location = {}) => {
  const uf = String(location.stateUf || location.state_uf || '').toUpperCase().trim()
  const cityKey = normalizeCityKey(location.city)

  const list = [
    ...nationalFixed(year),
    ...nationalMovable(year),
  ]

  if (uf && STATE_FIXED[uf]) {
    for (const item of STATE_FIXED[uf]) {
      const [mm, dd] = item.md.split('-').map(Number)
      list.push({ date: ymd(year, mm, dd), name: item.name, type: 'state' })
    }
  }

  if (uf && cityKey) {
    const cityHolidays = CITY_FIXED[`${uf}|${cityKey}`] || []
    for (const item of cityHolidays) {
      const [mm, dd] = item.md.split('-').map(Number)
      list.push({ date: ymd(year, mm, dd), name: item.name, type: 'municipal' })
    }
  }

  return dedupeByDateName(list).sort((a, b) => a.date.localeCompare(b.date))
}

/** Mapa date → feriados[] para um intervalo de anos. */
export const getHolidaysMap = (years, location = {}) => {
  const map = new Map()
  const yearList = Array.isArray(years) ? years : [years]
  for (const year of yearList) {
    for (const h of getHolidaysForYear(year, location)) {
      const prev = map.get(h.date) || []
      prev.push(h)
      map.set(h.date, prev)
    }
  }
  return map
}

export const getHolidaysOnDate = (dateYmd, location = {}) => {
  if (!dateYmd) return []
  const year = Number(String(dateYmd).slice(0, 4))
  if (!Number.isFinite(year)) return []
  return getHolidaysForYear(year, location).filter((h) => h.date === dateYmd)
}

export const isHoliday = (dateYmd, location = {}) => getHolidaysOnDate(dateYmd, location).length > 0

export const formatHolidaySummary = (holidays) => {
  if (!holidays?.length) return ''
  return holidays
    .map((h) => `${h.name} (${holidayTypeLabel(h.type)})`)
    .join(' · ')
}
