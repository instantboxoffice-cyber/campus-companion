export async function registerPushNotifications(supabase, userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { enabled: false, reason: 'This browser does not support push notifications.' }
  }

  if (!userId) {
    return { enabled: false, reason: 'User is not signed in yet.' }
  }

  if (!('Notification' in window)) {
    return { enabled: false, reason: 'This browser does not support notifications.' }
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { enabled: false, reason: 'Notification permission was not granted.' }
    }
  }

  if (Notification.permission !== 'granted') {
    return { enabled: false, reason: 'Notifications are blocked.' }
  }

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!publicKey) {
    return { enabled: false, reason: 'Missing VITE_VAPID_PUBLIC_KEY.' }
  }

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      auth: subscription.getKey('auth') ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')))) : null,
      p256dh: subscription.getKey('p256dh') ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  )

  if (error) {
    throw error
  }

  return { enabled: true, subscription }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i)
  }

  return output
}
