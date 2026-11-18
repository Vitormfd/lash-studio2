import { Suspense } from 'react'
import { Spinner } from './components/UI'
import { lazyPage } from './lib/lazyPage'

// Páginas públicas (link de agendamento e cartão fidelidade) sem carregar o app inteiro:
// a cliente abre o link mais rápido, principalmente no 4G.
const PublicBooking = lazyPage(() => import('./pages/PublicBooking'))
const PublicLoyalty = lazyPage(() => import('./pages/PublicLoyalty'))

const segmentAfter = (prefixes) => {
  const path = window.location.pathname || ''
  const prefix = prefixes.find((p) => path.startsWith(p))
  if (!prefix) return ''
  return decodeURIComponent(path.slice(prefix.length)).split('/')[0] || ''
}

const PublicRoot = () => {
  const isLoyalty = (window.location.pathname || '').startsWith('/fidelidade')
  return (
    <Suspense fallback={<Spinner text="Carregando..." />}>
      {isLoyalty
        ? <PublicLoyalty professionalId={segmentAfter(['/fidelidade/'])} />
        : <PublicBooking professionalId={segmentAfter(['/booking/', '/agendar/'])} />}
    </Suspense>
  )
}

export default PublicRoot
