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
  let payload = { title: 'Companion', body: 'You have a reminder.', data: { url: '/' } }
  try {
    if (event.data) payload = await event.data.json()
  } catch (err) {
    console.error('Push payload was not valid JSON:', err)
  }

  const openClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const appIsFocused = openClients.some((client) => client.focused)

  if (payload.data?.type === 'REMINDER_ALARM') {
    if (openClients.length > 0) {
      openClients.forEach((client) => {
        client.postMessage({ type: 'REMINDER_ALARM', data: payload.data })
      })
      return
    }
  }

  // Only chat replies get this treatment - if the app is already open and
  // focused, the reply already appeared in the conversation itself, so a
  // native notification on top would just be noise. Reminders fire
  // independently of any open tab, so they always notify.
  if (payload.data?.type === 'chat_reply') {
    if (appIsFocused) return
  }

  const title = payload.title || 'Companion'
  const options = {
    body: payload.body || 'You have a reminder.',
    icon: '/icon-192.png',
    badge: '/icon-maskable-192.png',
    data: payload.data || { url: '/' },
    tag: payload.tag,
    renotify: Boolean(payload.tag),
    requireInteraction: true,
    vibrate: [800, 250, 800, 250, 800],
  }

  await self.registration.showNotification(title, options)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const alarmPayload = event.notification.data || {}
  const rawAlarm = alarmPayload.reminderId ? JSON.stringify({
    reminderId: alarmPayload.reminderId,
    task: alarmPayload.task,
    dueAt: alarmPayload.dueAt,
    recurring: alarmPayload.recurring ?? null,
  }) : null

  const url = rawAlarm ? `/chat?alarm=${encodeURIComponent(rawAlarm)}` : alarmPayload.url || '/chat'
  event.waitUntil(clients.openWindow(url))
})