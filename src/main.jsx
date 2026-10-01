import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initAppUpdate } from './lib/appUpdate'

// Registers the service worker and keeps checking for new versions
// (every 30 minutes, and whenever the app comes back to the screen).
initAppUpdate()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
