import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { messagePreview } from '../../lib/messageUtils'
import {
  MAX_RECORD_SECONDS,
  startRecording,
  transcribeAudio,
  unlockAudio,
  voiceSupported,
} from '../../lib/voice'
import { SendIcon, TrashIcon, XIcon } from '../../components/Icons'
import { MicIcon, StopIcon, TextFormatIcon } from '../../components/ChatIcons'

function formatSeconds(total) {
  const m = Math.floor(total / 60)
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
}

// The typing box lives in its own component on purpose: every keystroke
// only re-renders THIS small box, not the whole message list. That is what
// keeps typing instant even in a long chat.
export default function Composer({ ref, onSend, busy, replyTo, onCancelReply, voicePrefs, onVoiceError }) {
  const [value, setValue] = useState('')
  const [showFormat, setShowFormat] = useState(false)
  const [mode, setMode] = useState('idle') // 'idle' | 'recording' | 'transcribing'
  const [seconds, setSeconds] = useState(0)
  const taRef = useRef(null)
  const recRef = useRef(null)
  const timerRef = useRef(null)
  const voiceDraftRef = useRef(false) // true while the text in the box came from speaking
  const latest = useRef({ voicePrefs, busy, onSend, onVoiceError })

  // The recording timer outlives a render, so it reads the newest values from here.
  useEffect(() => {
    latest.current = { voicePrefs, busy, onSend, onVoiceError }
  })

  useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus() }), [])

  // Grows the box as you type (up to about 6 lines), then scrolls inside.
  useLayoutEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`
  }, [value, mode])

  // Never leave the microphone running if this screen closes.
  useEffect(
    () => () => {
      clearInterval(timerRef.current)
      recRef.current?.cancel()
    },
    []
  )

  function submit() {
    const text = value.trim()
    if (!text || busy) return
    if (onSend(text, { viaVoice: voiceDraftRef.current })) {
      setValue('')
      voiceDraftRef.current = false
      taRef.current?.focus()
    }
  }

  // ---- voice ----------------------------------------------------------------
  async function finishVoice() {
    clearInterval(timerRef.current)
    const rec = recRef.current
    recRef.current = null
    if (!rec) return

    setMode('transcribing')
    const { blob, durationMs } = await rec.stop()

    if (durationMs < 700) {
      setMode('idle')
      latest.current.onVoiceError('That was too short. Tap the mic and speak a little longer.')
      return
    }

    try {
      const { text, silent } = await transcribeAudio(blob, latest.current.voicePrefs.language)
      const now = latest.current

      if (!text) {
        now.onVoiceError(
          silent ? "I couldn't hear anything. Check your mic and try again." : "I couldn't make out any words. Try again."
        )
      } else if (now.voicePrefs.autoSend && !now.busy && now.onSend(text, { viaVoice: true })) {
        // Sent straight away.
      } else {
        voiceDraftRef.current = true
        setValue((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))
        taRef.current?.focus()
      }
    } catch (err) {
      latest.current.onVoiceError(err?.message || "Couldn't understand that recording.")
    } finally {
      setMode('idle')
    }
  }

  async function startVoice() {
    unlockAudio() // lets the phone play the spoken reply later
    try {
      recRef.current = await startRecording()
    } catch (err) {
      latest.current.onVoiceError(err?.message || "Couldn't start the microphone.")
      return
    }

    setSeconds(0)
    setMode('recording')
    const startedAt = recRef.current.startedAt
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      setSeconds(elapsed)
      if (elapsed >= MAX_RECORD_SECONDS) finishVoice()
    }, 250)
  }

  function cancelVoice() {
    clearInterval(timerRef.current)
    recRef.current?.cancel()
    recRef.current = null
    setMode('idle')
  }

  // ---- formatting -----------------------------------------------------------
  // Wraps the selected text (or places the cursor between the marks).
  function wrap(mark) {
    const el = taRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end)
    setValue(value.slice(0, start) + mark + selected + mark + value.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const from = start + mark.length
      el.setSelectionRange(from, from + selected.length)
    })
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape' && replyTo) {
      onCancelReply()
      return
    }

    const usesKeyboard = window.matchMedia('(pointer: fine)').matches
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && usesKeyboard) {
      e.preventDefault()
      submit()
      return
    }

    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase()
      if (k === 'b') {
        e.preventDefault()
        wrap('*')
      } else if (k === 'i') {
        e.preventDefault()
        wrap('_')
      }
    }
  }

  // Keeps the text selection and the phone keyboard alive when a button is tapped.
  const keepFocus = (e) => e.preventDefault()

  const hasText = value.trim().length > 0
  const canSend = hasText && !busy
  const showMic = !hasText && voiceSupported()
  const voiceActive = mode !== 'idle'

  return (
    <div className="border-t border-slate-200 bg-white/90 px-3 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] pt-2.5 backdrop-blur">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-sm transition focus-within:border-primary/60">
        {replyTo && (
          <div className="fade-in mx-2.5 mt-2.5 flex items-start gap-2 rounded-xl border-l-4 border-primary bg-slate-50 px-3 py-1.5">
            <div className="min-w-0 flex-1 text-xs">
              <p className="font-semibold text-primary">
                Replying to {replyTo.sender === 'user' ? 'yourself' : 'Companion'}
              </p>
              <p className="line-clamp-1 break-words text-slate-500">{messagePreview(replyTo)}</p>
            </div>
            <button type="button" onClick={onCancelReply} onPointerDown={keepFocus} aria-label="Cancel reply">
              <XIcon className="h-4 w-4 text-slate-400" />
            </button>
          </div>
        )}

        {showFormat && !voiceActive && (
          <div className="fade-in flex items-center gap-1 px-3 pt-2 text-sm text-slate-600">
            <button type="button" onPointerDown={keepFocus} onClick={() => wrap('*')} className="h-8 w-8 rounded-lg font-bold hover:bg-slate-100" aria-label="Bold">
              B
            </button>
            <button type="button" onPointerDown={keepFocus} onClick={() => wrap('_')} className="h-8 w-8 rounded-lg italic hover:bg-slate-100" aria-label="Italic">
              I
            </button>
            <button type="button" onPointerDown={keepFocus} onClick={() => wrap('~')} className="h-8 w-8 rounded-lg line-through hover:bg-slate-100" aria-label="Strikethrough">
              S
            </button>
            <button type="button" onPointerDown={keepFocus} onClick={() => wrap('`')} className="h-8 w-8 rounded-lg font-mono hover:bg-slate-100" aria-label="Code">
              {'<>'}
            </button>
          </div>
        )}

        {voiceActive ? (
          <div className="fade-in flex items-center gap-2 p-1.5">
            <button
              type="button"
              onClick={cancelVoice}
              aria-label="Cancel recording"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              <TrashIcon className="h-5 w-5" />
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1" aria-live="polite">
              {mode === 'recording' ? (
                <>
                  <span className="rec-dot h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
                  <span className="text-sm tabular-nums text-slate-700">{formatSeconds(seconds)}</span>
                  <span className="flex h-5 items-center gap-0.5" aria-hidden="true">
                    {[0, 0.15, 0.3, 0.1, 0.25].map((delay) => (
                      <span key={delay} className="rec-bar" style={{ animationDelay: `${delay}s` }} />
                    ))}
                  </span>
                  <span className="truncate text-sm text-slate-400">Listening…</span>
                </>
              ) : (
                <>
                  <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />
                  <span className="text-sm text-slate-500">Turning your voice into text…</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={finishVoice}
              disabled={mode !== 'recording'}
              aria-label="Stop recording"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition active:scale-95 disabled:opacity-40"
            >
              <StopIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-1.5 p-1.5">
            <button
              type="button"
              onPointerDown={keepFocus}
              onClick={() => setShowFormat((v) => !v)}
              aria-label="Text formatting"
              className={`mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                showFormat ? 'bg-sky-100 text-primary' : 'text-slate-400 hover:bg-slate-100'
              }`}
            >
              <TextFormatIcon className="h-5 w-5" />
            </button>

            <textarea
              ref={taRef}
              rows={1}
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                if (!e.target.value.trim()) voiceDraftRef.current = false
              }}
              onKeyDown={handleKeyDown}
              placeholder="Message Companion…"
              enterKeyHint="send"
              className="max-h-36 min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none placeholder:text-slate-400"
            />

            {showMic ? (
              <button
                type="button"
                onPointerDown={keepFocus}
                onClick={startVoice}
                aria-label="Speak a message"
                className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition active:scale-95"
              >
                <MicIcon className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={keepFocus}
                onClick={submit}
                disabled={!canSend}
                aria-label="Send"
                className={`mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                  canSend ? 'bg-primary text-white active:scale-95' : 'bg-slate-100 text-slate-300'
                }`}
              >
                <SendIcon className="h-4.5 w-4.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}