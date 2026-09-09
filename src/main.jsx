import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// vite-plugin-pwa's registration helper: registers src/sw.js (built to
// dist/sw.js), and silently swaps in a new service worker as soon as one
// is available since `registerType: 'autoUpdate'` is set on the plugin -
// no "refresh to update" prompt needed for a single-page chat app.
registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
