import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"
import { sendPushToUser } from "../_shared/sendPush.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
}

type ReminderRow = {
  id: string
  user_id: string
  task: string
  due_at: string
  recurrence: string | null
  status: string
  created_at: string
}

const RECURRENCE_STEPS: Record<string, (d: Date) => void> = {
  daily: (d) => d.setDate(d.getDate() + 1),
  weekly: (d) => d.setDate(d.getDate() + 7),
  monthly: (d) => d.setMonth(d.getMonth() + 1),
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // This function acts on every user's reminders with full admin rights,
    // and it's only ever meant to be woken up by our own cron job - never
    // by a browser. The cron job sends this exact secret in a header;
    // anyone who doesn't know it (including someone who just guesses this
    // URL) is turned away before touching the database.
    const cronSecret = Deno.env.get("CRON_SECRET")
    const providedSecret = req.headers.get("x-cron-secret")

    if (!cronSecret || providedSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Supabase service credentials missing" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const serviceClient = createClient(supabaseUrl, supabaseKey)
    const now = new Date().toISOString()

    const { data: dueReminders, error: fetchError } = await serviceClient
      .from("reminders")
      .select("*")
      .lte("due_at", now)
      .eq("status", "pending")

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const reminders = (dueReminders ?? []) as ReminderRow[]
    let processed = 0

    for (const reminder of reminders) {
      // Claim this reminder before doing anything else with it. The WHERE
      // clause below only matches a row that is STILL "pending" the
      // instant this update runs. If a slightly-overlapping run (or a
      // slow previous run) already flipped it to "sent", this update
      // touches zero rows and we skip it - so the same reminder can never
      // be pushed twice, no matter how the timing lines up.
      const { data: claimed, error: claimError } = await serviceClient
        .from("reminders")
        .update({ status: "sent" })
        .eq("id", reminder.id)
        .eq("status", "pending")
        .select()
        .single()

      if (claimError || !claimed) {
        continue
      }

      const { error: createMessageError } = await serviceClient.from("messages").insert({
        user_id: reminder.user_id,
        sender: "companion",
        content: `Reminder: ${reminder.task}`,
      })

      if (createMessageError) {
        console.error("Failed to create reminder message", createMessageError)
      }

      try {
        await sendPushToUser(serviceClient, reminder.user_id, {
          title: "Companion",
          body: `Reminder: ${reminder.task}`,
          url: "/chat",
          tag: `reminder-${reminder.id}`,
          type: "reminder",
          urgency: "high",
          ttl: 3600,
        })
      } catch (pushError) {
        console.error("Failed to send reminder push notification", pushError)
      }

      processed++

      const applyStep = RECURRENCE_STEPS[reminder.recurrence ?? ""]

      if (applyStep) {
        // Recurring reminder: it briefly sat at "sent" from the claim
        // above, and now moves straight back to "pending" at its next
        // occurrence so the cron job picks it up again later.
        const nextDueAt = new Date(reminder.due_at)
        applyStep(nextDueAt)

        const { error: rescheduleError } = await serviceClient
          .from("reminders")
          .update({ due_at: nextDueAt.toISOString(), status: "pending" })
          .eq("id", reminder.id)

        if (rescheduleError) {
          console.error("Failed to reschedule recurring reminder", rescheduleError)
        }
      }
      // One-off reminders stay at "sent" - meaning "fired, not yet
      // actioned". The Reminders page is what lets the user tick it over
      // to "done" themselves, same as ticking off anything else on the list.
    }

    return new Response(
      JSON.stringify({ processed, checkedAt: now }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
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