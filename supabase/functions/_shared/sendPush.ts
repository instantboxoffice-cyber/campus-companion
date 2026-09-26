import webPush from "web-push"

let vapidConfigured = false

function ensureVapidConfigured() {
  if (vapidConfigured) return

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error("Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY")
  }

  webPush.setVapidDetails("mailto:hello@campuscompanion.app", vapidPublicKey, vapidPrivateKey)
  vapidConfigured = true
}

type PushOptions = {
  title: string
  body: string
  url?: string
  tag?: string
  type?: string
  // "high" tells the push service to try harder to wake a dozing phone -
  // worth it for something time-sensitive like a reminder. Leave unset
  // for things like a chat reply, where the library's normal default is fine.
  urgency?: "very-low" | "low" | "normal" | "high"
  // How long (in seconds) the push service should keep retrying if the
  // phone is offline, before giving up on this notification. Without
  // this, the library's own default is FOUR WEEKS - meaning a reminder
  // that couldn't be delivered right away could still pop up days later
  // once the phone reconnects. We default to 1 hour instead, so a stale
  // reminder is dropped rather than arriving absurdly late.
  ttl?: number
}

// Shared by every function that needs to push to a user's devices - looks
// up their subscriptions, sends to each, and prunes any endpoint the push
// service has permanently rejected (404/410) so future sends don't keep
// retrying a dead subscription.
export async function sendPushToUser(serviceClient, userId, options: PushOptions) {
  ensureVapidConfigured()

  const { title, body, url, tag, type, urgency, ttl } = options

  const { data: subscriptions, error } = await serviceClient
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId)

  if (error) {
    console.error("Failed to load push subscriptions", error)
    return { sent: 0, results: [] }
  }

  const results = []

  for (const subscription of subscriptions ?? []) {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: { auth: subscription.auth, p256dh: subscription.p256dh },
    }

    const payload = JSON.stringify({ title, body, tag, data: { url, type } })

    try {
      await webPush.sendNotification(pushSubscription, payload, {
        TTL: ttl ?? 3600,
        urgency: urgency ?? "normal",
      })
      results.push({ endpoint: subscription.endpoint, status: "sent" })
    } catch (pushErr) {
      console.error("Push delivery failed", pushErr)

      const statusCode = (pushErr as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        await serviceClient.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint)
      }

      results.push({ endpoint: subscription.endpoint, status: "failed", statusCode })
    }
  }

  return { sent: results.length, results }
}