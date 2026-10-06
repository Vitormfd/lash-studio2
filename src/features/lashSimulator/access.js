// Regra de acesso do Simulador de Cílios. O banco aplica a mesma regra via RLS
// (public.is_lash_designer), então esconder o menu não é a única proteção.
export const LASH_SIMULATOR_PAGE = 'lashSimulator'
export const LASH_SIMULATOR_TITLE = 'Simulador de Cílios'

// Oculto por enquanto: troque para true para liberar o simulador às lash designers.
export const LASH_SIMULATOR_RELEASED = false

export const canUseLashSimulator = (professionalType) =>
  LASH_SIMULATOR_RELEASED && professionalType === 'lash'
