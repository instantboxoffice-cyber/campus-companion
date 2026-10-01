/* global __APP_BUILD__ */
import { registerSW } from 'virtual:pwa-register'

// Stamped at build time (see vite.config.js), so each deploy has a different value.
export const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev'

const CHECK_EVERY_MS = 30 * 60 * 1000 // every 30 minutes while the app is open
const MIN_GAP_MS = 60 * 1000 // but never more than once a minute for focus/online checks

let registration = null
let lastCheck = 0

export function buildLabel() {
  const date = new Date(APP_BUILD)
  if (Number.isNaN(date.getTime())) return 'dev'
  return date.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

// Call once, from main.jsx. Replaces the plain registerSW() call.
export function initAppUpdate() {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, reg) {
      if (!reg) return
      registration = reg

      const check = () => {
        if (Date.now() - lastCheck < MIN_GAP_MS) return
        lastCheck = Date.now()
        reg.update().catch(() => {})
      }

      setInterval(() => {
        lastCheck = Date.now()
        reg.update().catch(() => {})
      }, CHECK_EVERY_MS)

      // The key one: when the app comes back to the screen, look for a new version.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('online', check)
    },
  })
}

// Used by the "Check for updates" menu item.
// 'updating' = a new version was found and the app will restart itself in a moment.
export async function checkForUpdate() {
  if (!registration) return 'unsupported'
  try {
    await registration.update()
    return registration.installing || registration.waiting ? 'updating' : 'latest'
  } catch {
    return 'error'
  }
}

// Used by the "Force refresh" menu item: throws away the stored copy of the app
// and reloads it from the server. The user stays logged in (their login is not
// stored in these caches) and push notifications are not affected.
export async function forceRefresh() {
  try {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  } catch {
    // caches may be unavailable; still reload
  }
  try {
    await registration?.update()
  } catch {
    // ignore
  }
  window.location.reload()
}