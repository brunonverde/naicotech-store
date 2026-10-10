import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fontes empacotadas no build (servidas pelo próprio site: nada de CDN externo, CSP intacta).
import '@fontsource-variable/inter'
import '@fontsource/rajdhani/latin-700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
