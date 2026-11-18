import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { Spinner } from './components/UI'
import { lazyPage } from './lib/lazyPage'
import { initFacebookPixel } from './lib/facebookPixel'
import { captureSignupSource } from './lib/signupSource'

// Antes do App: ele limpa alguns parâmetros da URL ao abrir.
captureSignupSource()

// Initialize Facebook Pixel
initFacebookPixel()

// Link de agendamento e cartão fidelidade abrem só a página pública, sem o app inteiro.
const isPublicPage = /^\/(booking|agendar|fidelidade)(\/|$)/.test(window.location.pathname || '')
const Root = lazyPage(() => (isPublicPage ? import('./PublicRoot.jsx') : import('./App.jsx')))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={<Spinner text="Carregando..." />}>
      <Root />
    </Suspense>
  </StrictMode>,
)
