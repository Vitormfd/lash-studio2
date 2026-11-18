import { describe, expect, it, vi } from 'vitest'
import { loadWithReload } from '../src/lib/lazyPage'

const memoryStorage = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}

describe('telas sob demanda depois de uma atualização', () => {
  it('carrega normal quando o arquivo existe', async () => {
    const reload = vi.fn()
    await expect(loadWithReload(() => Promise.resolve({ default: 'ok' }), { storage: memoryStorage(), reload })).resolves.toEqual({ default: 'ok' })
    expect(reload).not.toHaveBeenCalled()
  })

  it('arquivo antigo sumiu: recarrega a página uma vez', async () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    const pending = loadWithReload(() => Promise.reject(new Error('Failed to fetch dynamically imported module')), { storage, reload })
    await new Promise((r) => setTimeout(r, 0))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(storage.getItem('es-chunk-reload')).toBe('1')
    void pending
  })

  it('se falhar de novo depois de recarregar, mostra o erro (sem recarregar em loop)', async () => {
    const storage = memoryStorage()
    storage.setItem('es-chunk-reload', '1')
    const reload = vi.fn()
    await expect(loadWithReload(() => Promise.reject(new Error('falhou')), { storage, reload })).rejects.toThrow('falhou')
    expect(reload).not.toHaveBeenCalled()
  })

  it('depois de carregar com sucesso, uma falha futura pode recarregar de novo', async () => {
    const storage = memoryStorage()
    storage.setItem('es-chunk-reload', '1')
    await loadWithReload(() => Promise.resolve({}), { storage, reload: vi.fn() })
    expect(storage.getItem('es-chunk-reload')).toBeNull()
  })
})
