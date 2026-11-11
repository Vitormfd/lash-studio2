import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.jsx'
import { initFacebookPixel } from './lib/facebookPixel'
import { captureSignupSource } from './lib/signupSource'

// Antes do App: ele limpa alguns parâmetros da URL ao abrir.
captureSignupSource()

// Initialize Facebook Pixel
initFacebookPixel()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
