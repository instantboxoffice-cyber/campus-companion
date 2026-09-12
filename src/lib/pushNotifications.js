export async function registerPushNotifications(supabase, userId) {
  if (!window.isSecureContext) {
    // The Push API is only available on https:// or http://localhost.
    // Opening the site as http://192.168.x.x:5173 on a phone to test on a
    // real device - the most common way to actually try this feature -
    // silently fails this exact check.
    return { enabled: false, reason: 'Push notifications require HTTPS (or localhost).' }
  }

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
    return {
      enabled: false,
      reason: 'Notifications are not enabled yet. Choose Enable Notifications in the chat menu.',
    }
  }

  if (Notification.permission === 'denied') {
    return {
      enabled: false,
      reason: 'Notification permission was denied. Notifications are blocked by the browser.',
    }
  }

  if (Notification.permission !== 'granted') {
    return { enabled: false, reason: 'Notification permission is not granted.' }
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

  // Use the browser's own toJSON() rather than hand-rolling the key
  // encoding. It's spec-guaranteed to emit `keys.auth`/`keys.p256dh` as
  // base64url (the format the `web-push` library on the server expects) -
  // manually doing `btoa(String.fromCharCode(...))` produces plain base64
  // instead, which silently corrupts whichever keys happen to contain a
  // `+`, `/`, or trailing `=`, and that's what was breaking delivery.
  const { endpoint, keys } = subscription.toJSON()

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint,
      auth: keys?.auth ?? null,
      p256dh: keys?.p256dh ?? null,
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