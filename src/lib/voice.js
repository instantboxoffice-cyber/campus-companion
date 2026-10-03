import { supabase } from './supabaseClient'

// Everything about voice: saved settings, recording, speech-to-text,
// and reading replies aloud.

// ---- settings --------------------------------------------------------------
const PREFS_KEY = 'cc_voice_prefs_v1'

export const VOICE_LANGUAGES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English (Nigerian accent)' },
  { value: 'pcm', label: 'Nigerian Pidgin' },
  { value: 'yo', label: 'Yorùbá' },
  { value: 'ha', label: 'Hausa' },
  { value: 'ig', label: 'Igbo' },
]

// Voice notes are now sent automatically (as real voice notes) by default.
const DEFAULT_PREFS = { language: 'auto', autoSend: true, readAloud: false, natural: false }

export function loadVoicePrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
    // One-time switch: people who saved settings before this update had
    // auto-send OFF stored. Turn it ON once; they can still switch it off.
    if (!raw.autoSendV2) {
      raw.autoSend = true
      raw.autoSendV2 = true
    }
    return { ...DEFAULT_PREFS, ...raw }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveVoicePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Not critical.
  }
}

// ---- recording -------------------------------------------------------------
export class VoiceError extends Error {}

export const MAX_RECORD_SECONDS = 60

export function voiceSupported() {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  )
}

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

function pickMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

export async function startRecording() {
  if (!voiceSupported()) throw new VoiceError("This browser can't record voice.")

  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
  } catch (err) {
    if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
      throw new VoiceError('The microphone is blocked. Allow it in your browser settings, then try again.')
    }
    if (err?.name === 'NotFoundError') throw new VoiceError('No microphone found on this device.')
    throw new VoiceError("Couldn't start the microphone.")
  }

  const mime = pickMime()
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const chunks = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data)
  }

  const releaseMic = () => stream.getTracks().forEach((t) => t.stop())
  const startedAt = Date.now()
  recorder.start()

  return {
    startedAt,
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          releaseMic()
          resolve({
            blob: new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' }),
            durationMs: Date.now() - startedAt,
          })
        }
        recorder.stop()
      }),
    cancel: () => {
      recorder.onstop = releaseMic
      try {
        recorder.stop()
      } catch {
        // Already stopped.
      }
      releaseMic()
    },
  }
}

// ---- speech to text --------------------------------------------------------
// Turns any recording into a small 16 kHz mono WAV, which both Groq and
// Gemini accept. Also measures the loudest point, so a silent recording is
// never sent (silence can make speech models invent words).
export function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeText = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

async function toWav16k(blob) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  const ctx = new AudioCtx()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const length = Math.max(1, Math.ceil(decoded.duration * 16000))
    const offline = new OfflineAudioContext(1, length, 16000)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    const samples = rendered.getChannelData(0)

    let peak = 0
    for (let i = 0; i < samples.length; i++) {
      const a = Math.abs(samples[i])
      if (a > peak) peak = a
    }
    return { wav: encodeWav(samples, 16000), peak }
  } finally {
    ctx.close?.()
  }
}

function audioExtension(type = '') {
  if (type.includes('wav')) return 'wav'
  if (type.includes('mp4')) return 'm4a'
  if (type.includes('ogg')) return 'ogg'
  return 'webm'
}

// Step 1: get the recording ready. The result is ONE file used for both
// the voice note (saved + played back) and the speech-to-text.
// Plays on every phone because it is a plain WAV whenever conversion works.
export async function prepareAudio(blob) {
  try {
    const { wav, peak } = await toWav16k(blob)
    return { audio: wav, silent: peak < 0.015 }
  } catch {
    // Could not convert on this device - keep the original recording as it is.
    return { audio: blob, silent: false }
  }
}

// Step 2: turn the prepared audio into text (the AI needs text to understand).
export async function transcribePrepared(audio, language) {
  const form = new FormData()
  form.append('audio', audio, `voice.${audioExtension(audio.type)}`)
  form.append('language', language || 'auto')

  const { data, error } = await supabase.functions.invoke('transcribe', { body: form })
  if (error || typeof data?.text !== 'string') {
    throw new VoiceError("I couldn't understand that recording. Please try again.")
  }
  return { text: data.text.trim(), silent: false }
}

// Kept for the "type the words into the box" mode (auto-send switched off).
export async function transcribeAudio(blob, language) {
  const { audio, silent } = await prepareAudio(blob)
  if (silent) return { text: '', silent: true }
  return transcribePrepared(audio, language)
}

// ---- voice notes (saved audio) ---------------------------------------------
// Private folder in Supabase Storage. Only the owner can read or write it.
export const VOICE_BUCKET = 'chat-audio'

// Saves the voice note and returns its path, e.g. "USER_ID/abc123.wav".
export async function uploadVoiceNote(audio, userId) {
  const path = `${userId}/${crypto.randomUUID()}.${audioExtension(audio.type)}`
  const { error } = await supabase.storage.from(VOICE_BUCKET).upload(path, audio, {
    contentType: (audio.type || 'audio/wav').split(';')[0],
    cacheControl: '31536000',
  })
  if (error) {
    console.error('Voice note upload failed', error)
    throw new VoiceError("Couldn't send your voice note. Check your connection and try again.")
  }
  return path
}

export function removeVoiceNote(path) {
  if (!path) return
  supabase.storage.from(VOICE_BUCKET).remove([path]).catch(() => {})
}

// Private files need a temporary link to play. Links are remembered so each
// voice note asks only once.
const linkCache = new Map()
const LINK_LIFETIME_S = 6 * 60 * 60

export async function getVoiceNoteUrl(path) {
  const hit = linkCache.get(path)
  if (hit && hit.expires > Date.now()) return hit.url

  const { data, error } = await supabase.storage.from(VOICE_BUCKET).createSignedUrl(path, LINK_LIFETIME_S)
  if (error || !data?.signedUrl) throw new VoiceError("Couldn't load this voice note.")
  linkCache.set(path, { url: data.signedUrl, expires: Date.now() + (LINK_LIFETIME_S - 600) * 1000 })
  return data.signedUrl
}

export function forgetVoiceNoteUrl(path) {
  linkCache.delete(path)
}

// ---- reading replies aloud -------------------------------------------------
const LANG_TAGS = { en: 'en-NG', yo: 'yo-NG', ha: 'ha-NG', ig: 'ig-NG' }

// A very small guess at the language of a reply, from its special letters.
export function guessLanguage(text) {
  if (/[ịụṅ]/i.test(text)) return 'ig'
  if (/[ɓɗƙƴ]/i.test(text)) return 'ha'
  if (/[ẹọṣ]/i.test(text)) return 'yo'
  return 'en'
}

// Removes things that sound bad when read aloud (marks, links, emoji, code).
export function speakableText(text, max = 1200) {
  const clean = (text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-•*]|\d{1,3}[.)])\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut
}

let player = null
let stopCurrent = null
let session = 0

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

// Phones only allow sound after a tap. Calling this inside a tap (mic button,
// speaker button) "unlocks" sound, so a reply that arrives a few seconds later
// can still be spoken.
export function unlockAudio() {
  try {
    if (!player) player = new Audio()
    player.src = SILENT_WAV
    player.play().catch(() => {})
  } catch {
    // Not critical.
  }
}

export function stopSpeaking() {
  session++
  if (stopCurrent) {
    const stop = stopCurrent
    stopCurrent = null
    stop()
  }
}

function pickVoice(lang) {
  const synth = window.speechSynthesis
  const voices = synth?.getVoices?.() ?? []
  const same = (v, tag) => v.lang.replace('_', '-').toLowerCase() === tag.toLowerCase()

  const wanted = lang === 'en' ? ['en-NG', 'en-GB', 'en-ZA', 'en-US'] : [LANG_TAGS[lang]]
  for (const tag of wanted) {
    const hit = voices.find((v) => same(v, tag))
    if (hit) return hit
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith(lang === 'en' ? 'en' : lang)) || null
}

function playBrowser(text, lang) {
  return new Promise((resolve) => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
    if (!synth) {
      resolve()
      return
    }

    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = pickVoice(lang)
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    } else {
      utterance.lang = LANG_TAGS[lang] || 'en-NG'
    }

    const finish = () => {
      stopCurrent = null
      resolve()
    }
    utterance.onend = finish
    utterance.onerror = finish
    stopCurrent = () => {
      synth.cancel()
      resolve()
    }
    synth.speak(utterance)
  })
}

async function playNatural(text, accent, mine) {
  const { data, error } = await supabase.functions.invoke('speak', { body: { text, accent } })

  if (error || !data?.audio) {
    const failure = new Error('natural voice failed')
    failure.code = error?.context?.status === 429 || data?.error === 'limit' ? 'limit' : 'fail'
    throw failure
  }
  if (mine !== session) return // Person tapped stop while this was loading.

  if (!player) player = new Audio()
  const audio = player
  audio.src = `data:${data.mime || 'audio/wav'};base64,${data.audio}`

  await new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.onended = null
      audio.onerror = null
      stopCurrent = null
    }
    audio.onended = () => {
      cleanup()
      resolve()
    }
    audio.onerror = () => {
      cleanup()
      reject(new Error('playback failed'))
    }
    stopCurrent = () => {
      audio.pause()
      cleanup()
      resolve()
    }
    audio.play().catch((err) => {
      cleanup()
      reject(err)
    })
  })
}

// Reads text aloud. Phone voice by default (free, instant). Natural voice
// (Gemini) when switched on, and for Yoruba / Hausa / Igbo text, because
// phones have no voice for those languages.
export async function speakText(rawText, { natural = false, onNotice } = {}) {
  stopSpeaking()
  const mine = session

  const lang = guessLanguage(rawText)
  const wantNatural = natural || lang !== 'en'
  const text = speakableText(rawText, wantNatural ? 700 : 1500)
  if (!text) return

  if (wantNatural) {
    try {
      await playNatural(text, lang === 'en', mine)
      return
    } catch (err) {
      if (mine !== session) return
      onNotice?.(
        err?.code === 'limit'
          ? 'Natural voice limit reached. Using your phone voice.'
          : "Natural voice isn't available right now. Using your phone voice."
      )
    }
  }

  if (mine !== session) return
  await playBrowser(text, lang)
}