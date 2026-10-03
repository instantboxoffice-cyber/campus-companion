import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"
import { sendPushToUser } from "../_shared/sendPush.ts"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

function previewFor(record: Record<string, unknown>): string {
  const text = String(record.content ?? "").trim()
  if (record.attachment_type === "image") return text ? `📷 ${text}` : "📷 Photo"
  if (record.attachment_type === "audio") return "🎤 Voice message"
  if (record.attachment_type === "file") {
    return `📄 ${record.attachment_name ?? "Document"}`
  }
  return text.length > 140 ? `${text.slice(0, 137)}...` : text
}

Deno.serve(async (req) => {
  // Only our own database webhook may call this. It sends the secret in a header.
  const secret = Deno.env.get("DM_WEBHOOK_SECRET")
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return json({ error: "Unauthorized" }, 401)
  }

  try {
    const payload = await req.json()
    if (payload?.type !== "INSERT" || payload?.table !== "direct_messages") {
      return json({ skipped: true })
    }

    const record = payload.record
    if (!record?.sender_id || !record?.recipient_id) return json({ skipped: true })

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !supabaseKey) {
      return json({ error: "Supabase service credentials missing" }, 500)
    }
    const serviceClient = createClient(supabaseUrl, supabaseKey)

    const { data: sender } = await serviceClient
      .from("profiles")
      .select("username")
      .eq("id", record.sender_id)
      .maybeSingle()

    const result = await sendPushToUser(serviceClient, record.recipient_id, {
      title: sender?.username ?? "New message",
      body: previewFor(record),
      url: `/dm/${record.sender_id}`,
      tag: `dm-${record.sender_id}`,
      type: "dm",
      urgency: "high",
      ttl: 86400,
    })

    return json({ sent: result.sent })
  } catch (error) {
    console.error("notify-dm failed", error)
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500)
  }
})
