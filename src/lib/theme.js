const THEME_STORAGE_PREFIX = 'lash_theme_'

export const THEMES = {
  rose: {
    id: 'rose',
    label: 'Rose (padrao)',
    vars: {
      '--rose': '#E8B4B8',
      '--rose-light': '#F7E8EA',
      '--rose-deep': '#C17B82',
      '--rose-dark': '#8B4D55',
      '--nude': '#F2E4D8',
      '--nude-light': '#FBF6F2',
      '--nude-dark': '#C4A48A',
      '--blush': '#F5D5D8',
      '--blush-mid': '#E9B8BC',
      '--off-white': '#FDFAF8',
      '--surface': '#FFFFFF',
      '--text': '#2C1A1E',
      '--text-mid': '#6B4A50',
      '--text-light': '#A07880',
      '--border': 'rgba(200, 150, 158, 0.2)',
      '--border-mid': 'rgba(193, 123, 130, 0.35)',
      '--shadow': 'rgba(139, 77, 85, 0.08)',
    },
  },
  lavender: {
    id: 'lavender',
    label: 'Lavanda',
    vars: {
      '--rose': '#CDBCEB',
      '--rose-light': '#F1ECFA',
      '--rose-deep': '#8F79C5',
      '--rose-dark': '#5F4A8B',
      '--nude': '#E8E2F4',
      '--nude-light': '#F8F6FC',
      '--nude-dark': '#A79AC4',
      '--blush': '#DDD2F2',
      '--blush-mid': '#C9B9E8',
      '--off-white': '#FBFAFE',
      '--surface': '#FFFFFF',
      '--text': '#261F37',
      '--text-mid': '#5E5478',
      '--text-light': '#8A82A6',
      '--border': 'rgba(143, 121, 197, 0.2)',
      '--border-mid': 'rgba(143, 121, 197, 0.35)',
      '--shadow': 'rgba(95, 74, 139, 0.1)',
    },
  },
  ocean: {
    id: 'ocean',
    label: 'Oceano',
    vars: {
      '--rose': '#9FD3E5',
      '--rose-light': '#E7F5FA',
      '--rose-deep': '#3E90AE',
      '--rose-dark': '#2C657A',
      '--nude': '#DCEEF4',
      '--nude-light': '#F4FAFC',
      '--nude-dark': '#7EA9B8',
      '--blush': '#CCE6F0',
      '--blush-mid': '#A8D5E4',
      '--off-white': '#F8FCFD',
      '--surface': '#FFFFFF',
      '--text': '#15303A',
      '--text-mid': '#3D6472',
      '--text-light': '#6E93A1',
      '--border': 'rgba(62, 144, 174, 0.2)',
      '--border-mid': 'rgba(62, 144, 174, 0.35)',
      '--shadow': 'rgba(44, 101, 122, 0.1)',
    },
  },
  emerald: {
    id: 'emerald',
    label: 'Esmeralda',
    vars: {
      '--rose': '#A9D8C1',
      '--rose-light': '#EAF6F0',
      '--rose-deep': '#4C9B72',
      '--rose-dark': '#2F6C4F',
      '--nude': '#DFEEE5',
      '--nude-light': '#F5FBF7',
      '--nude-dark': '#86B49B',
      '--blush': '#CFE6DA',
      '--blush-mid': '#B5D8C5',
      '--off-white': '#F9FCFA',
      '--surface': '#FFFFFF',
      '--text': '#163126',
      '--text-mid': '#3F6A57',
      '--text-light': '#719383',
      '--border': 'rgba(76, 155, 114, 0.2)',
      '--border-mid': 'rgba(76, 155, 114, 0.35)',
      '--shadow': 'rgba(47, 108, 79, 0.1)',
    },
  },
  terracotta: {
    id: 'terracotta',
    label: 'Terracota',
    vars: {
      '--rose': '#E1A98B',
      '--rose-light': '#FAECE4',
      '--rose-deep': '#C46A45',
      '--rose-dark': '#8D462E',
      '--nude': '#F3DDCF',
      '--nude-light': '#FDF6F2',
      '--nude-dark': '#C7967F',
      '--blush': '#EDD0C0',
      '--blush-mid': '#DEB29D',
      '--off-white': '#FEFAF8',
      '--surface': '#FFFFFF',
      '--text': '#3A2118',
      '--text-mid': '#724537',
      '--text-light': '#9C6B5A',
      '--border': 'rgba(196, 106, 69, 0.2)',
      '--border-mid': 'rgba(196, 106, 69, 0.35)',
      '--shadow': 'rgba(141, 70, 46, 0.1)',
    },
  },
  barber: {
    id: 'barber',
    label: 'Barber (grafite e âmbar)',
    vars: {
      '--rose': '#5A4A38',
      '--rose-light': '#2E2A26',
      '--rose-deep': '#D89A3C',
      '--rose-dark': '#F2C46D',
      '--nude': '#3A342D',
      '--nude-light': '#24211E',
      '--nude-dark': '#8C7A62',
      '--blush': '#332E28',
      '--blush-mid': '#4A4037',
      '--off-white': '#151412',
      '--surface': '#211F1C',
      '--text': '#F3EEE6',
      '--text-mid': '#CFC6B8',
      '--text-light': '#9A8F7F',
      '--border': 'rgba(216, 154, 60, 0.2)',
      '--border-mid': 'rgba(216, 154, 60, 0.38)',
      '--shadow': 'rgba(0, 0, 0, 0.45)',
    },
  },
  marinho: {
    id: 'marinho',
    label: 'Marinho',
    vars: {
      '--rose': '#9FB0C8',
      '--rose-light': '#E6EBF2',
      '--rose-deep': '#2F4A6D',
      '--rose-dark': '#1C2F4A',
      '--nude': '#DDE3EC',
      '--nude-light': '#F3F5F9',
      '--nude-dark': '#7F8DA3',
      '--blush': '#D0D8E4',
      '--blush-mid': '#B0BDD0',
      '--off-white': '#F6F7FA',
      '--surface': '#FFFFFF',
      '--text': '#141C2A',
      '--text-mid': '#3E4B62',
      '--text-light': '#6F7C93',
      '--border': 'rgba(47, 74, 109, 0.2)',
      '--border-mid': 'rgba(47, 74, 109, 0.35)',
      '--shadow': 'rgba(28, 47, 74, 0.1)',
    },
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    vars: {
      '--rose': '#4D5566',
      '--rose-light': '#2A3040',
      '--rose-deep': '#8DA2C7',
      '--rose-dark': '#C6D3E8',
      '--nude': '#3A4254',
      '--nude-light': '#252B38',
      '--nude-dark': '#707C96',
      '--blush': '#32394A',
      '--blush-mid': '#465069',
      '--off-white': '#1C212C',
      '--surface': '#2A3142',
      '--text': '#EFF3FA',
      '--text-mid': '#C4CDDD',
      '--text-light': '#93A0B8',
      '--border': 'rgba(141, 162, 199, 0.22)',
      '--border-mid': 'rgba(141, 162, 199, 0.38)',
      '--shadow': 'rgba(0, 0, 0, 0.35)',
    },
  },
}

export const THEME_LIST = Object.values(THEMES)

export const getThemeStorageKey = (userId) => `${THEME_STORAGE_PREFIX}${userId || 'default'}`

export const getDefaultThemeId = (isBarber) => (isBarber ? 'barber' : 'rose')

export const hasSavedTheme = (userId) => {
  try {
    return !!THEMES[localStorage.getItem(getThemeStorageKey(userId))]
  } catch {
    return false
  }
}

export const getSavedThemeId = (userId, fallbackId = 'rose') => {
  try {
    const id = localStorage.getItem(getThemeStorageKey(userId))
    return THEMES[id] ? id : fallbackId
  } catch {
    return fallbackId
  }
}

export const applyTheme = (themeId) => {
  if (typeof document === 'undefined') return
  const chosen = THEMES[themeId] || THEMES.rose
  const root = document.documentElement
  Object.entries(chosen.vars).forEach(([key, value]) => root.style.setProperty(key, value))
}

export const saveAndApplyTheme = (userId, themeId) => {
  const safe = THEMES[themeId] ? themeId : 'rose'
  try {
    localStorage.setItem(getThemeStorageKey(userId), safe)
  } catch {}
  applyTheme(safe)
  return safe
}

