import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(event))
})

async function handlePush(event) {
  let payload = { title: 'Campus Companion', body: 'You have a reminder.', data: { url: '/' } }
  try {
    if (event.data) payload = event.data.json()
  } catch (err) {
    console.error('Push payload was not valid JSON:', err)
  }

  // Only chat replies get this treatment - if the app is already open and
  // focused, the reply already appeared in the conversation itself, so a
  // native notification on top would just be noise. Reminders fire
  // independently of any open tab, so they always notify.
  if (payload.data?.type === 'chat_reply') {
    const openClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const appIsFocused = openClients.some((client) => client.focused)
    if (appIsFocused) return
  }

  const title = payload.title || 'Campus Companion'
  const options = {
    body: payload.body || 'You have a reminder.',
    icon: '/icon-192.png',
    badge: '/icon-maskable-192.png',
    data: payload.data || { url: '/' },
    tag: payload.tag,
    renotify: Boolean(payload.tag),
  }

  await self.registration.showNotification(title, options)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'
  event.waitUntil(clients.openWindow(url))
})