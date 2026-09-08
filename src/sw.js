self.addEventListener('push', (event) => {
  const payload = event.data?.json?.() ?? {
    title: 'Campus Companion',
    body: 'You have a reminder.',
    data: { url: '/' },
  }

  const title = payload.title || 'Campus Companion'
  const options = {
    body: payload.body || 'You have a reminder.',
    icon: '/vite.svg',
    badge: '/vite.svg',
    data: payload.data || { url: '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'
  event.waitUntil(clients.openWindow(url))
})
