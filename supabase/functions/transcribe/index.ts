import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

// Turns a short voice recording into text.
//   Groq Whisper (free) first. Gemini (free) as backup.
//   Igbo goes to Gemini first, because Whisper does not support Igbo.

const GROQ_STT_MODEL = Deno.env.get("GROQ_STT_MODEL") || "whisper-large-v3-turbo"
const GEMINI_STT_MODEL = Deno.env.get("GEMINI_STT_MODEL") || Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash"
const MAX_BYTES = 8 * 1024 * 1024

// App language choice -> Whisper language code. "auto" sends no hint.
const WHISPER_LANGS = { en: "en", pcm: "en", yo: "yo", ha: "ha" }
const LANGUAGE_NAMES = {
  en: "Nigerian English",
  pcm: "Nigerian Pidgin",
  yo: "Yoruba",
  ha: "Hausa",
  ig: "Igbo",
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function errMessage(err) {
  return err instanceof Error ? err.message : String(err)
}

function toBase64(bytes) {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function transcribeGroq(file, language) {
  const key = Deno.env.get("GROQ_API_KEY")
  if (!key) throw new Error("GROQ_API_KEY is not set")

  const form = new FormData()
  form.append("file", file, file.name || "voice.wav")
  form.append("model", GROQ_STT_MODEL)
  form.append("response_format", "json")
  form.append("temperature", "0")
  const code = WHISPER_LANGS[language]
  if (code) form.append("language", code)

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    throw new Error(`Groq STT ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const data = await res.json()
  return typeof data?.text === "string" ? data.text : ""
}

async function transcribeGemini(file, language) {
  const key = Deno.env.get("GEMINI_API_KEY")
  if (!key) throw new Error("GEMINI_API_KEY is not set")

  const bytes = new Uint8Array(await file.arrayBuffer())
  const likely = LANGUAGE_NAMES[language]
  const prompt =
    `Transcribe this audio exactly as spoken. The speaker is Nigerian and may use English, Nigerian Pidgin, Yoruba, Hausa or Igbo${likely ? ` (most likely ${likely})` : ""}. ` +
    `Keep the original language, do not translate. Use correct Yoruba tone marks and Igbo or Hausa special letters when you are sure. ` +
    `Reply with ONLY the transcript. If there is no speech, reply with nothing.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_STT_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: (file.type || "audio/wav").split(";")[0], data: toBase64(bytes) } },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(40000),
    },
  )

  if (!res.ok) {
    throw new Error(`Gemini STT ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts
  return Array.isArray(parts)
    ? parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("")
    : ""
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const authHeader = req.headers.get("Authorization")
    if (!supabaseUrl || !supabaseAnonKey || !authHeader) {
      return json({ error: "Missing auth or Supabase environment values" }, 500)
    }

    // Only signed-in users may use this (it spends your free speech quota).
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: "Unauthorized" }, 401)

    const form = await req.formData()
    const audio = form.get("audio")
    const language = String(form.get("language") || "auto")

    if (!(audio instanceof File) || audio.size === 0) return json({ error: "No audio received" }, 400)
    if (audio.size > MAX_BYTES) return json({ error: "Recording is too long" }, 413)

    const order = language === "ig" ? ["gemini", "groq"] : ["groq", "gemini"]
    const errors = []

    for (const provider of order) {
      try {
        const text = provider === "groq"
          ? await transcribeGroq(audio, language)
          : await transcribeGemini(audio, language)
        return json({ text: text.trim(), provider })
      } catch (err) {
        console.error(`Transcription failed (${provider})`, err)
        errors.push(`${provider}: ${errMessage(err)}`)
      }
    }

    return json({ error: "transcription_failed", details: errors }, 502)
  } catch (err) {
    return json({ error: errMessage(err) }, 500)
  }
})