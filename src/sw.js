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

  if (payload.data?.type === 'dm') {
    const sameChatOpen = openClients.some((client) => {
      const url = new URL(client.url)
      return client.focused && url.pathname === payload.data.url
    })
    if (sameChatOpen) return
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

  if (payload.data?.type === 'REMINDER_ALARM' && payload.data.actionToken && payload.data.actionUrl) {
    options.actions = [
      { action: 'snooze', title: 'Snooze 10 min' },
      { action: 'done', title: 'Done' },
    ]
  }

  await self.registration.showNotification(title, options)
}

async function reminderFromData(data) {
  if (!data?.reminderId) return null
  return {
    id: data.reminderId,
    due_at: data.dueAt,
    task: data.task,
    recurrence: data.recurring ?? null,
  }
}

async function runReminderAction(data, action) {
  const reminder = await reminderFromData(data)
  try {
    const res = await fetch(data.actionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: data.actionToken, action }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const openClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    openClients.forEach((client) => client.postMessage({ type: 'REMINDER_ACK', reminder }))
  } catch (err) {
    console.error('Reminder action failed', err)
    await self.registration.showNotification("Couldn't update that reminder", {
      body: 'Tap to open it and try again.',
      icon: '/icon-192.png',
      badge: '/icon-maskable-192.png',
      data,
      tag: `reminder-retry-${reminder?.id ?? 'unknown'}`,
    })
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}

  if (
    data.type === 'REMINDER_ALARM' &&
    (event.action === 'snooze' || event.action === 'done') &&
    data.actionToken &&
    data.actionUrl
  ) {
    event.waitUntil(runReminderAction(data, event.action))
    return
  }

  if (data.type === 'dm') {
    event.waitUntil((async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existingWindow = windows.find((client) => new URL(client.url).pathname === data.url)

      if (existingWindow) {
        try {
          await existingWindow.focus()
          try {
            await existingWindow.navigate(data.url)
          } catch {
            // ignore navigation failure and fall through to opening a fresh window
          }
          return
        } catch {
          // ignore focus failure and fall through to openWindow below
        }
      }

      await clients.openWindow(data.url)
    })())
    return
  }

  const alarmPayload = data
  const rawAlarm = alarmPayload.reminderId ? JSON.stringify({
    reminderId: alarmPayload.reminderId,
    task: alarmPayload.task,
    dueAt: alarmPayload.dueAt,
    recurring: alarmPayload.recurring ?? null,
  }) : null

  const url = rawAlarm ? `/chat?alarm=${encodeURIComponent(rawAlarm)}` : alarmPayload.url || '/chat'
  event.waitUntil(clients.openWindow(url))
})