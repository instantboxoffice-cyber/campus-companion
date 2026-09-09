import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

// Precache the app shell that vite-plugin-pwa injects at build time, so the
// installed app can launch (and re-launch) even with a flaky connection.
self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  let payload = { title: 'Campus Companion', body: 'You have a reminder.', data: { url: '/' } }
  try {
    if (event.data) payload = event.data.json()
  } catch (err) {
    console.error('Push payload was not valid JSON:', err)
  }

  const title = payload.title || 'Campus Companion'
  const options = {
    body: payload.body || 'You have a reminder.',
    icon: '/icon-192.png',
    badge: '/icon-maskable-192.png',
    data: payload.data || { url: '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'
  event.waitUntil(clients.openWindow(url))
})
