import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"
import { verifyToken } from "../_shared/actionToken.ts"

const SNOOZE_MINUTES = 10

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })

  try {
    const { token, action } = await req.json()
    if (action !== "snooze" && action !== "done") return json({ error: "Bad action" }, 400)

    const payload = await verifyToken(String(token ?? ""))
    if (!payload) return json({ error: "Invalid or expired token" }, 401)

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !supabaseKey) return json({ error: "Service credentials missing" }, 500)
    const serviceClient = createClient(supabaseUrl, supabaseKey)

    const { data: reminder } = await serviceClient
      .from("reminders")
      .select("*")
      .eq("id", String(payload.rid))
      .eq("user_id", String(payload.uid))
      .maybeSingle()

    if (!reminder) return json({ error: "Reminder not found" }, 404)

    if (action === "done") {
      if (!reminder.recurrence) {
        const { error } = await serviceClient
          .from("reminders")
          .update({ status: "done" })
          .eq("id", reminder.id)
        if (error) return json({ error: error.message }, 500)
      }
      return json({ ok: true })
    }

    const dueAt = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000).toISOString()

    if (reminder.recurrence) {
      const { error } = await serviceClient.from("reminders").insert({
        user_id: reminder.user_id,
        task: reminder.task,
        due_at: dueAt,
        status: "pending",
      })
      if (error) return json({ error: error.message }, 500)
    } else {
      const { error } = await serviceClient
        .from("reminders")
        .update({ due_at: dueAt, status: "pending" })
        .eq("id", reminder.id)
      if (error) return json({ error: error.message }, 500)
    }

    return json({ ok: true })
  } catch (error) {
    console.error("reminder-action failed", error)
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500)
  }
})
