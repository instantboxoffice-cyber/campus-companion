import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"
import webPush from "web-push"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")

    if (!supabaseUrl || !supabaseKey || !vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "Missing required VAPID or Supabase environment values" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    webPush.setVapidDetails(
      "mailto:hello@campuscompanion.app",
      vapidPublicKey,
      vapidPrivateKey
    )

    const body = await req.json()
    const reminder = body.reminder

    if (!reminder || !reminder.user_id || !reminder.task) {
      return new Response(JSON.stringify({ error: "Reminder payload is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const serviceClient = createClient(supabaseUrl, supabaseKey)

    const { data: subscriptions, error: subscriptionError } = await serviceClient
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", reminder.user_id)

    if (subscriptionError) {
      return new Response(JSON.stringify({ error: subscriptionError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const results = []

    for (const subscription of subscriptions ?? []) {
      const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          auth: subscription.auth,
          p256dh: subscription.p256dh,
        },
      }

      const payload = JSON.stringify({
        title: "Campus Companion",
        body: `Reminder: ${reminder.task}`,
        data: { url: "/" },
      })

      try {
        await webPush.sendNotification(pushSubscription, payload)
        results.push({ endpoint: subscription.endpoint, status: "sent" })
      } catch (pushErr) {
        console.error("Push delivery failed", pushErr)

        // 404/410 mean the push service has permanently invalidated this
        // endpoint (user uninstalled, cleared site data, etc). Leaving it
        // in the table means every future reminder keeps retrying - and
        // failing against - a subscription that will never work again.
        const statusCode = pushErr?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          await serviceClient.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint)
        }

        results.push({ endpoint: subscription.endpoint, status: "failed", statusCode })
      }
    }

    return new Response(JSON.stringify({ sent: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})
