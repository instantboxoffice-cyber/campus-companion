import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { DateTime } from "luxon"
import { createClient } from "@supabase/supabase-js"
import { sendPushToUser } from "../_shared/sendPush.ts"

// ---------------------------------------------------------------------------
// Settings. Every one of these can be changed later from Supabase secrets
// without touching this file (except IMAGE_BUCKET, which must match the SQL).
// ---------------------------------------------------------------------------
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-20b"
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash"
const GEMINI_IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image"
// Which AI to try first. "groq,gemini" = Groq first, Gemini if Groq fails.
const PROVIDER_ORDER = (Deno.env.get("AI_PROVIDER_ORDER") || "groq,gemini")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
// Which service draws pictures. "cloudflare" is free. "gemini" needs a paid Google plan.
const IMAGE_PROVIDER_ORDER = (Deno.env.get("IMAGE_PROVIDER_ORDER") || "cloudflare")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
const CLOUDFLARE_IMAGE_MODEL = Deno.env.get("CLOUDFLARE_IMAGE_MODEL") || "@cf/black-forest-labs/flux-1-schnell"
// Max images one user can make per 24 hours (protects your free quota).
const IMAGE_DAILY_LIMIT = Number(Deno.env.get("IMAGE_DAILY_LIMIT") || 10)
const IMAGE_BUCKET = "chat-images"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function normalizeModelJson(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return ""
  }

  let text = rawText.trim()

  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/s, "")
  }

  text = text.replace(/^json\s+/i, "")
  text = text.replace(/^\s*```json\s*/i, "")
  text = text.replace(/```\s*$/s, "")

  const first = text.indexOf("{")
  const last = text.lastIndexOf("}")
  if (first >= 0 && last > first) {
    text = text.slice(first, last + 1)
  }

  return text
}

function errMessage(err) {
  return err instanceof Error ? err.message : String(err)
}

// ---------------------------------------------------------------------------
// Text AI #1: Groq
// ---------------------------------------------------------------------------
async function callGroq(systemPrompt, history) {
  const key = Deno.env.get("GROQ_API_KEY")
  if (!key) throw new Error("GROQ_API_KEY is not set")

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...history],
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(25000),
  })

  if (!res.ok) {
    throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error("Groq returned no content")
  return text
}

// ---------------------------------------------------------------------------
// Text AI #2: Gemini
// Gemini names the roles "user" and "model" (not "assistant"), and its
// conversation must start with a "user" turn, so we convert the history.
// ---------------------------------------------------------------------------
function toGeminiContents(history) {
  const contents = []
  for (const m of history) {
    const role = m.role === "assistant" ? "model" : "user"
    const text = typeof m.content === "string" ? m.content : ""
    if (!text) continue
    if (contents.length === 0 && role === "model") continue

    const last = contents[contents.length - 1]
    if (last && last.role === role) {
      last.parts[0].text += "\n" + text
      continue
    }
    contents.push({ role, parts: [{ text }] })
  }
  return contents
}

async function callGemini(systemPrompt, history) {
  const key = Deno.env.get("GEMINI_API_KEY")
  if (!key) throw new Error("GEMINI_API_KEY is not set")

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: toGeminiContents(history),
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(25000),
    },
  )

  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts
  const text = Array.isArray(parts)
    ? parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("")
    : ""
  if (!text) throw new Error("Gemini returned no text")
  return text
}

// Tries each AI in PROVIDER_ORDER. If one fails (rate limit, bad key, bad
// JSON, timeout), it moves on to the next one instead of giving up.
async function askModel(systemPrompt, history) {
  const errors = []

  for (const provider of PROVIDER_ORDER) {
    try {
      let raw
      if (provider === "groq") raw = await callGroq(systemPrompt, history)
      else if (provider === "gemini") raw = await callGemini(systemPrompt, history)
      else continue

      const parsed = JSON.parse(normalizeModelJson(raw))
      if (!parsed || typeof parsed !== "object") throw new Error("Reply was not a JSON object")
      return { parsed, provider, errors }
    } catch (err) {
      console.error(`AI provider failed (${provider})`, err)
      errors.push(`${provider}: ${errMessage(err)}`)
    }
  }

  return { parsed: null, provider: null, errors }
}

// ---------------------------------------------------------------------------
// Image generation (Gemini) + saving the picture to Supabase Storage
// ---------------------------------------------------------------------------
async function generateGeminiImage(prompt) {
  const key = Deno.env.get("GEMINI_API_KEY")
  if (!key) throw new Error("GEMINI_API_KEY is not set")

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      signal: AbortSignal.timeout(60000),
    },
  )

  if (!res.ok) {
    throw new Error(`Gemini image ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p) => p.inlineData || p.inline_data)
  const inline = imagePart?.inlineData || imagePart?.inline_data

  if (!inline?.data) {
    const why = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || "no image returned"
    throw new Error(`Gemini image: ${why}`)
  }

  return { base64: inline.data, mimeType: inline.mimeType || inline.mime_type || "image/png" }
}

async function generateCloudflareImage(prompt) {
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN")
  if (!accountId || !token) throw new Error("CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN is not set")

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_IMAGE_MODEL}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ prompt: prompt.slice(0, 2000), steps: 4 }),
      signal: AbortSignal.timeout(60000),
    },
  )

  if (!res.ok) {
    throw new Error(`Cloudflare image ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const data = await res.json()
  const base64 = data?.result?.image
  if (!base64) {
    throw new Error(`Cloudflare image: no picture returned (${JSON.stringify(data?.errors ?? []).slice(0, 200)})`)
  }

  return { base64, mimeType: "image/jpeg" }
}

// Tries each image service in IMAGE_PROVIDER_ORDER until one works.
async function generateImage(prompt) {
  const errors = []
  for (const provider of IMAGE_PROVIDER_ORDER) {
    try {
      if (provider === "cloudflare") return await generateCloudflareImage(prompt)
      if (provider === "gemini") return await generateGeminiImage(prompt)
    } catch (err) {
      console.error(`Image provider failed (${provider})`, err)
      errors.push(`${provider}: ${errMessage(err)}`)
    }
  }
  throw new Error(errors.join(" | ") || "No image provider is set up")
}

async function saveImageToStorage(serviceClient, userId, base64, mimeType) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png"
  const path = `${userId}/${crypto.randomUUID()}.${ext}`

  const { error } = await serviceClient.storage
    .from(IMAGE_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: false })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  return serviceClient.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
}

async function imagesMadeInLast24h(serviceClient, userId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await serviceClient
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("image_url", "is", null)
    .gte("created_at", since)
  if (error) throw new Error(`Could not check image limit: ${error.message}`)
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Main reply logic
// ---------------------------------------------------------------------------
async function generateAndSaveReply({ history, userTimezone, userLocalTime, user, serviceClient }) {
  const systemPrompt = `You are the AI companion inside "Campus Companion," a friendly reminder app. You talk like a warm, casual friend — not a form or a robot. Keep replies short, natural, and conversational, the way a real friend texting on WhatsApp would.

You will receive the recent conversation history, ending with the user's latest message. Use that history to understand context — especially if you previously asked a clarifying question and the user's latest message is answering it. Combine the earlier request with the new detail rather than asking again, unless something is still genuinely missing.

Classify the latest message (in light of the history) as one of:
- A clear or now-complete reminder request
- Still missing a detail (task or time) — ask a short, specific follow-up
- A request to draw, generate, create or design a picture, image, logo, poster, wallpaper or illustration
- Not any of the above — just chatting

Respond ONLY with valid JSON, no markdown, no explanation, in this exact shape:
{
  "intent": "one of: 'reminder', 'clarify', 'image', 'chat'",
  "task": "string or null — what needs to be done, only if intent is 'reminder'",
  "due_at": "local date-time string or null — only if intent is 'reminder' and a time was clear",
  "recurrence": "one of: null, 'daily', 'weekly', 'monthly'",
  "image_prompt": "string or null — only if intent is 'image'",
  "reply": "your natural, human, conversational response to the user — this is what gets shown in the chat"
}

Rules:
- If intent is "reminder": due_at must be resolvable — combine info across the conversation if needed. Reply with a warm, brief confirmation. Vary your phrasing naturally, don't always start with the same word.
- If intent is "clarify": ask for exactly the one piece still missing (don't re-ask for something already given earlier in the history).
- If intent is "image": you CAN make images. Put a detailed, vivid description in "image_prompt" (subject, style, colors, mood, composition), staying faithful to what the user asked, written in English. Do not put any text the user did not ask for inside the picture. "reply" is a short, friendly line that goes with the picture (for example "Here you go!" — say it as if the picture is arriving together with your message). If the request has no subject at all (for example just "draw something"), use intent "clarify" and ask what they would like. A request like "remind me to draw" is a reminder, not an image.
- If intent is "chat": task/due_at/recurrence/image_prompt are null. Reply naturally like a friend would.
- Never sound robotic, never repeat the user's message back verbatim, never use overly formal language.
- The user's current local date and time is ${userLocalTime}, in the ${userTimezone} timezone. Interpret every relative time ("tomorrow", "in an hour", "tonight", "next Monday") against that local time, not UTC.
- CRITICAL: due_at must be the user's own local wall-clock time, written as YYYY-MM-DDTHH:mm:ss — no timezone offset, no "Z" suffix, no conversion to UTC. Just write the time exactly as the user would read it off their own clock. A separate system converts it correctly afterward — if you convert it yourself, it will be converted twice and end up wrong.`

  const { parsed, provider, errors } = await askModel(systemPrompt, history)

  if (!parsed) {
    return { error: "ai_failed", details: errors }
  }
  console.log(`Reply generated by ${provider}`)

  if (parsed.intent === "reminder" && parsed.due_at) {
    const localDt = DateTime.fromISO(parsed.due_at, { zone: userTimezone })

    if (localDt.isValid) {
      parsed.due_at = localDt.toUTC().toISO()
    } else {
      parsed.intent = "clarify"
      parsed.task = null
      parsed.due_at = null
      parsed.reply = "Sorry, I didn't quite catch the time on that — could you say it again?"
    }
  }

  // ---- Image request -------------------------------------------------------
  let imageUrl = null

  if (parsed.intent === "image") {
    const imagePrompt = typeof parsed.image_prompt === "string" ? parsed.image_prompt.trim() : ""

    if (!imagePrompt) {
      parsed.intent = "clarify"
      parsed.reply = parsed.reply || "Sure! What would you like me to draw?"
    } else {
      try {
        const used = await imagesMadeInLast24h(serviceClient, user.id)
        if (used >= IMAGE_DAILY_LIMIT) {
          parsed.intent = "chat"
          parsed.reply = `You've used all ${IMAGE_DAILY_LIMIT} of today's image requests. Ask me again tomorrow and I'll make it for you!`
        } else {
          const image = await generateImage(imagePrompt)
          imageUrl = await saveImageToStorage(serviceClient, user.id, image.base64, image.mimeType)
        }
      } catch (err) {
        console.error("Image generation failed", err)
        parsed.intent = "chat"
        parsed.reply = "I couldn't make that image right now. Try again in a little while?"
        // Turn on by adding the secret IMAGE_DEBUG=true. Shows the real reason in the chat.
        if (Deno.env.get("IMAGE_DEBUG") === "true") {
          parsed.reply += `\n\n[Debug: ${errMessage(err)}]`
        }
      }
    }
  }

  let companionMessage = null

  if (parsed.reply) {
    if (parsed.intent === "reminder" && parsed.task && parsed.due_at) {
      const { error: reminderError } = await serviceClient.from("reminders").insert({
        user_id: user.id,
        task: parsed.task,
        due_at: parsed.due_at,
        recurrence: parsed.recurrence,
      })
      if (reminderError) console.error("Failed to save reminder", reminderError)
    }

    // image_url is only added when there really is an image, so normal
    // replies keep working even before the database change is applied.
    const messageRow = { user_id: user.id, sender: "companion", content: parsed.reply }
    if (imageUrl) messageRow.image_url = imageUrl

    const { data, error: messageError } = await serviceClient
      .from("messages")
      .insert(messageRow)
      .select()
      .single()

    if (messageError) console.error("Failed to save companion message", messageError)
    companionMessage = data

    try {
      await sendPushToUser(serviceClient, user.id, {
        title: "Companion",
        body: imageUrl ? `🖼️ ${parsed.reply}` : parsed.reply,
        url: "/chat",
        tag: "companion-chat",
        type: "chat_reply",
      })
    } catch (pushErr) {
      console.error("Push notification failed", pushErr)
    }
  }

  return { ...parsed, image_url: imageUrl, message: companionMessage }
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const authHeader = req.headers.get("Authorization")

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth or Supabase environment values" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    const userTimezone = typeof timezone === "string" && timezone ? timezone : "UTC"
    const userLocalTime = typeof localTime === "string" && localTime
      ? localTime
      : DateTime.now().setZone(userTimezone).toFormat("yyyy-MM-dd'T'HH:mm:ss")

    // Protects this work from being cut off if the client disconnects
    // mid-request (tab closed right after sending) - without this, the
    // runtime can retire the function early once it looks idle, killing
    // the AI call, the image upload, the DB insert, or the push send
    // wherever they were.
    const workPromise = generateAndSaveReply({ history, userTimezone, userLocalTime, user, serviceClient })
    EdgeRuntime.waitUntil(workPromise)

    const result = await workPromise

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: errMessage(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})