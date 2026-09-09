import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { DateTime } from "luxon"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { history, timezone, localTime } = await req.json()

    if (!history || !Array.isArray(history) || history.length === 0) {
      return new Response(JSON.stringify({ error: "No conversation history provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Fall back to UTC if the client somehow didn't send a zone (older
    // cached build, etc) rather than letting the request fail outright.
    const userTimezone = typeof timezone === "string" && timezone ? timezone : "UTC"
    const userLocalTime = typeof localTime === "string" && localTime
      ? localTime
      : DateTime.now().setZone(userTimezone).toFormat("yyyy-MM-dd'T'HH:mm:ss")

    const systemPrompt = `You are the AI companion inside "Campus Companion," a friendly reminder app. You talk like a warm, casual friend — not a form or a robot. Keep replies short, natural, and conversational, the way a real friend texting on WhatsApp would.

You will receive the recent conversation history, ending with the user's latest message. Use that history to understand context — especially if you previously asked a clarifying question and the user's latest message is answering it. Combine the earlier request with the new detail rather than asking again, unless something is still genuinely missing.

Classify the latest message (in light of the history) as one of:
- A clear or now-complete reminder request
- Still missing a detail (task or time) — ask a short, specific follow-up
- Not a reminder at all — just chatting

Respond ONLY with valid JSON, no markdown, no explanation, in this exact shape:
{
  "intent": "one of: 'reminder', 'clarify', 'chat'",
  "task": "string or null — what needs to be done, only if intent is 'reminder'",
  "due_at": "local date-time string or null — only if intent is 'reminder' and a time was clear",
  "recurrence": "one of: null, 'daily', 'weekly', 'monthly'",
  "reply": "your natural, human, conversational response to the user — this is what gets shown in the chat"
}

Rules:
- If intent is "reminder": due_at must be resolvable — combine info across the conversation if needed. Reply with a warm, brief confirmation. Vary your phrasing naturally, don't always start with the same word.
- If intent is "clarify": ask for exactly the one piece still missing (don't re-ask for something already given earlier in the history).
- If intent is "chat": task/due_at/recurrence are null. Reply naturally like a friend would.
- Never sound robotic, never repeat the user's message back verbatim, never use overly formal language.
- The user's current local date and time is ${userLocalTime}, in the ${userTimezone} timezone. Interpret every relative time ("tomorrow", "in an hour", "tonight", "next Monday") against that local time, not UTC.
- CRITICAL: due_at must be the user's own local wall-clock time, written as YYYY-MM-DDTHH:mm:ss — no timezone offset, no "Z" suffix, no conversion to UTC. Just write the time exactly as the user would read it off their own clock. A separate system converts it correctly afterward — if you convert it yourself, it will be converted twice and end up wrong.`

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("GROQ_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "system", content: systemPrompt }, ...history],
        temperature: 0.1,
      }),
    })

    const groqData = await groqRes.json()

    if (!groqData.choices) {
      return new Response(JSON.stringify({ groqStatus: groqRes.status, groqData }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const parsed = JSON.parse(groqData.choices[0].message.content)

    // This is the one place actual timezone math happens - deliberately
    // outside the LLM. Luxon has real IANA tz-database rules (DST
    // transitions, historical offset changes, etc), so it converts the
    // AI's plain local time into the correct UTC instant reliably, every
    // time - something no amount of prompting can guarantee from a model.
    if (parsed.intent === "reminder" && parsed.due_at) {
      const localDt = DateTime.fromISO(parsed.due_at, { zone: userTimezone })

      if (localDt.isValid) {
        parsed.due_at = localDt.toUTC().toISO()
      } else {
        // The model returned something that isn't a real local time
        // (e.g. malformed string) - don't silently save a broken
        // reminder, ask the user to restate it instead.
        parsed.intent = "clarify"
        parsed.task = null
        parsed.due_at = null
        parsed.reply = "Sorry, I didn't quite catch the time on that — could you say it again?"
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})