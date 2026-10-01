import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

// Turns a reply into natural-sounding speech with Gemini text-to-speech.
// Gemini detects the language of the text by itself.
// Free allowance is small, so the app uses it only when the person turns on
// "Natural voice", or for Yoruba / Hausa / Igbo text (phones have no voice for those).

const GEMINI_TTS_MODEL = Deno.env.get("GEMINI_TTS_MODEL") || "gemini-2.5-flash-preview-tts"
const GEMINI_TTS_VOICE = Deno.env.get("GEMINI_TTS_VOICE") || "Kore"
const MAX_CHARS = 1000

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

function base64ToBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes) {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// Gemini sends raw 16-bit mono sound. Browsers need a WAV "wrapper" to play it.
export function pcmToWav(pcm, sampleRate) {
  const header = new ArrayBuffer(44)
  const v = new DataView(header)
  const writeText = (offset, text) => {
    for (let i = 0; i < text.length; i++) v.setUint8(offset + i, text.charCodeAt(i))
  }
  writeText(0, "RIFF")
  v.setUint32(4, 36 + pcm.length, true)
  writeText(8, "WAVE")
  writeText(12, "fmt ")
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // plain PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  writeText(36, "data")
  v.setUint32(40, pcm.length, true)

  const wav = new Uint8Array(44 + pcm.length)
  wav.set(new Uint8Array(header), 0)
  wav.set(pcm, 44)
  return wav
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const authHeader = req.headers.get("Authorization")
    const geminiKey = Deno.env.get("GEMINI_API_KEY")
    if (!supabaseUrl || !supabaseAnonKey || !authHeader) {
      return json({ error: "Missing auth or Supabase environment values" }, 500)
    }
    if (!geminiKey) return json({ error: "GEMINI_API_KEY is not set" }, 500)

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: "Unauthorized" }, 401)

    const body = await req.json()
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : ""
    if (!text) return json({ error: "No text to read" }, 400)

    const style = body?.accent
      ? "Say in a warm, friendly, natural tone with a Nigerian accent: "
      : "Say in a warm, friendly, natural tone: "

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: style + text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } } },
          },
        }),
        signal: AbortSignal.timeout(45000),
      },
    )

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300)
      console.error(`Gemini TTS ${res.status}: ${detail}`)
      // 429 = free allowance used up. The app then switches to the phone's own voice.
      return json({ error: res.status === 429 ? "limit" : "tts_failed", details: detail }, res.status === 429 ? 429 : 502)
    }

    const data = await res.json()
    const parts = data?.candidates?.[0]?.content?.parts ?? []
    const inline = parts.map((p) => p.inlineData || p.inline_data).find((x) => x?.data)
    if (!inline?.data) return json({ error: "tts_failed", details: "no audio returned" }, 502)

    const rate = Number(String(inline.mimeType || inline.mime_type || "").match(/rate=(\d+)/)?.[1]) || 24000
    const wav = pcmToWav(base64ToBytes(inline.data), rate)

    return json({ audio: bytesToBase64(wav), mime: "audio/wav", provider: "gemini" })
  } catch (err) {
    return json({ error: errMessage(err) }, 500)
  }
})