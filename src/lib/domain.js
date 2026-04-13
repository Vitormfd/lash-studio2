export const APP_NAME = 'Studio Flow'
export const APP_SHORT_NAME = 'Studio Flow'
export const APP_TAGLINE = 'Gestão profissional'
export const APP_DESCRIPTION = 'Agenda, clientes, serviços, financeiro e relatórios para profissionais da beleza.'
export const DEFAULT_PROFESSIONAL_TYPE = 'lash'
export const DEFAULT_SERVICE_NAME = 'Serviço padrão'

export const PROFESSIONAL_TYPE_OPTIONS = [
  { value: 'lash', label: 'Lash designer', shortLabel: 'Lash', icon: '✨' },
  { value: 'nail', label: 'Nail designer', shortLabel: 'Nail', icon: '💅' },
  { value: 'sobrancelha', label: 'Designer de sobrancelha', shortLabel: 'Sobrancelha', icon: '🪄' },
  { value: 'estetica', label: 'Estética', shortLabel: 'Estética', icon: '🌿' },
]

const PROFESSIONAL_TYPE_VALUES = new Set(PROFESSIONAL_TYPE_OPTIONS.map((option) => option.value))

export const normalizeProfessionalType = (value) =>
  PROFESSIONAL_TYPE_VALUES.has(value) ? value : DEFAULT_PROFESSIONAL_TYPE

export const getProfessionalTypeMeta = (value) => {
  const normalized = normalizeProfessionalType(value)
  return PROFESSIONAL_TYPE_OPTIONS.find((option) => option.value === normalized)
}
