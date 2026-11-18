import { lazy } from 'react'

const RELOAD_KEY = 'es-chunk-reload'

/**
 * lazy() que se recupera de atualização do app: quem está com uma versão antiga aberta
 * pede um arquivo que não existe mais depois do deploy. Em vez de tela branca, recarrega
 * a página uma vez (pega a versão nova). Se falhar de novo, mostra o erro normal.
 */
export const loadWithReload = (factory, { storage = globalThis.sessionStorage, reload = () => globalThis.location.reload() } = {}) =>
  factory()
    .then((mod) => {
      try { storage?.removeItem(RELOAD_KEY) } catch {}
      return mod
    })
    .catch((error) => {
      let alreadyReloaded = false
      try { alreadyReloaded = storage?.getItem(RELOAD_KEY) === '1' } catch {}
      if (alreadyReloaded) throw error
      try { storage?.setItem(RELOAD_KEY, '1') } catch {}
      reload()
      return new Promise(() => {}) // a página vai recarregar
    })

export const lazyPage = (factory) => lazy(() => loadWithReload(factory))
