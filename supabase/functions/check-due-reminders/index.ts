import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type ReminderRow = {
  id: string
  user_id: string
  task: string
  due_at: string
  recurrence: string | null
  completed: boolean
  created_at: string
}

async function sendReminderPush(supabaseUrl: string, supabaseKey: string, reminder: ReminderRow) {
  const pushUrl = new URL('/functions/v1/send-reminder-push', supabaseUrl).toString()

  const res = await fetch(pushUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    },
    body: JSON.stringify({ reminder }),
  })

  return await res.json()
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
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
      .eq("completed", false)

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const reminders = (dueReminders ?? []) as ReminderRow[]

    for (const reminder of reminders) {
      const { error: createMessageError } = await serviceClient.from("messages").insert({
        user_id: reminder.user_id,
        sender: "companion",
        content: `Reminder: ${reminder.task}`,
      })

      if (createMessageError) {
        console.error("Failed to create reminder message", createMessageError)
      }

      try {
        await sendReminderPush(supabaseUrl, supabaseKey, reminder)
      } catch (pushError) {
        console.error("Failed to send reminder push notification", pushError)
      }

      if (!reminder.recurrence) {
        const { error: completeError } = await serviceClient
          .from("reminders")
          .update({ completed: true })
          .eq("id", reminder.id)

        if (completeError) {
          console.error("Failed to complete one-off reminder", completeError)
        }
        continue
      }

      const nextDueAt = new Date(reminder.due_at)

      if (reminder.recurrence === "daily") {
        nextDueAt.setDate(nextDueAt.getDate() + 1)
      } else if (reminder.recurrence === "weekly") {
        nextDueAt.setDate(nextDueAt.getDate() + 7)
      } else if (reminder.recurrence === "monthly") {
        nextDueAt.setMonth(nextDueAt.getMonth() + 1)
      }

      const { error: rescheduleError } = await serviceClient
        .from("reminders")
        .update({ due_at: nextDueAt.toISOString(), completed: false })
        .eq("id", reminder.id)

      if (rescheduleError) {
        console.error("Failed to reschedule recurring reminder", rescheduleError)
      }
    }

    return new Response(
      JSON.stringify({ processed: reminders.length, checkedAt: now }),
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
