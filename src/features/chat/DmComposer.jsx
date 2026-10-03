import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MAX_RECORD_SECONDS, prepareAudio, startRecording, voiceSupported } from '../../lib/voice'
import { MAX_FILE_BYTES, compressImage, dmPreview, fileExtension, formatFileSize } from '../../lib/dmMedia'
import { SendIcon, TrashIcon, XIcon } from '../../components/Icons'
import {
  CameraOutlineIcon,
  FileIcon,
  ImageIcon,
  MicIcon,
  PaperclipIcon,
  StopIcon,
} from '../../components/ChatIcons'

function formatSeconds(total) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// The typing box is its own component so each keystroke only re-renders this
// small box and not the whole message list.
export default function DmComposer({ onSendText, onSendFiles, onSendVoice, replyTo, onCancelReply, onError, friendName }) {
  const [value, setValue] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [mode, setMode] = useState('idle') // 'idle' | 'recording' | 'preparing'
  const [seconds, setSeconds] = useState(0)
  const [pending, setPending] = useState([]) // files waiting in the preview sheet
  const [caption, setCaption] = useState('')
  const taRef = useRef(null)
  const recRef = useRef(null)
  const timerRef = useRef(null)
  const galleryRef = useRef(null)
  const cameraRef = useRef(null)
  const docRef = useRef(null)
  const latest = useRef({ onSendVoice, onError })

  useEffect(() => {
    latest.current = { onSendVoice, onError }
  })

  useLayoutEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`
  }, [value, mode])

  // Never leave the microphone running when this screen closes.
  useEffect(
    () => () => {
      clearInterval(timerRef.current)
      recRef.current?.cancel()
    },
    []
  )

  // Free the preview thumbnails when they are replaced or closed.
  useEffect(() => () => pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)), [pending])

  // ---- text -----------------------------------------------------------------
  function submit() {
    const text = value.trim()
    if (!text) return
    onSendText(text)
    setValue('')
    taRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape' && replyTo) {
      onCancelReply()
      return
    }
    // Enter sends on desktop; on phones it stays a new line, like WhatsApp.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault()
      submit()
    }
  }

  // ---- voice note (sent straight away as a real voice note) -----------------
  async function startVoice() {
    try {
      recRef.current = await startRecording()
    } catch (err) {
      onError(err?.message || "Couldn't start the microphone.")
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

  async function finishVoice() {
    clearInterval(timerRef.current)
    const rec = recRef.current
    recRef.current = null
    if (!rec) return

    setMode('preparing')
    const { blob, durationMs } = await rec.stop()
    if (durationMs < 700) {
      setMode('idle')
      latest.current.onError('That was too short. Tap the mic and speak a little longer.')
      return
    }
    // Converts to a WAV that plays on every phone and also detects silence.
    const { audio, silent } = await prepareAudio(blob)
    setMode('idle')
    if (silent) {
      latest.current.onError("I couldn't hear anything. Check your mic and try again.")
      return
    }
    latest.current.onSendVoice({ blob: audio, seconds: Math.max(1, Math.round(durationMs / 1000)) })
  }

  function cancelVoice() {
    clearInterval(timerRef.current)
    recRef.current?.cancel()
    recRef.current = null
    setMode('idle')
  }

  // ---- attachments ----------------------------------------------------------
  async function addFiles(fileList, kind) {
    setMenuOpen(false)
    const files = Array.from(fileList || [])
    if (!files.length) return

    const accepted = []
    for (const file of files.slice(0, 10)) {
      if (file.size > MAX_FILE_BYTES) {
        onError(`"${file.name}" is bigger than 25 MB.`)
        continue
      }
      const isImage = kind !== 'document' && file.type.startsWith('image/')
      const ready = isImage ? await compressImage(file) : file
      accepted.push({
        id: crypto.randomUUID(),
        file: ready,
        type: isImage ? 'image' : 'file',
        preview: isImage ? URL.createObjectURL(ready) : null,
      })
    }
    if (!accepted.length) return
    setPending(accepted)
    setCaption(value.trim())
    if (value.trim()) setValue('')
  }

  function closePreview() {
    setPending([])
    setCaption('')
  }

  function sendPending() {
    if (!pending.length) return
    onSendFiles(
      pending.map((p) => ({ file: p.file, type: p.type })),
      caption.trim()
    )
    setPending([])
    setCaption('')
  }

  function removePending(id) {
    setPending((prev) => prev.filter((p) => p.id !== id))
  }

  // Paste a screenshot or copied picture straight into the chat (desktop).
  function handlePaste(e) {
    const images = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'))
    if (images.length) {
      e.preventDefault()
      addFiles(images, 'photo')
    }
  }

  const keepFocus = (e) => e.preventDefault()
  const hasText = value.trim().length > 0
  const showMic = !hasText && voiceSupported()
  const voiceActive = mode !== 'idle'

  return (
    <>
      <div className="relative border-t border-slate-200 bg-white/95 px-2.5 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur">
        {replyTo && (
          <div className="fade-in mx-auto mb-2 flex max-w-3xl items-start gap-2 rounded-xl border-l-4 border-primary bg-slate-50 px-3 py-1.5">
            <div className="min-w-0 flex-1 text-xs">
              <p className="font-semibold text-primary">Replying to {replyTo.mine ? 'yourself' : `@${friendName}`}</p>
              <p className="line-clamp-1 break-words text-slate-500">{dmPreview(replyTo.msg)}</p>
            </div>
            <button type="button" onClick={onCancelReply} onPointerDown={keepFocus} aria-label="Cancel reply">
              <XIcon className="h-4 w-4 text-slate-400" />
            </button>
          </div>
        )}

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div className="sheet-in absolute bottom-full left-2.5 z-40 mb-2 w-52 rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-slate-200">
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] text-slate-800 hover:bg-slate-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                  <ImageIcon className="h-5 w-5" />
                </span>
                Photos
              </button>
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] text-slate-800 hover:bg-slate-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                  <CameraOutlineIcon className="h-5 w-5" />
                </span>
                Camera
              </button>
              <button
                type="button"
                onClick={() => docRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] text-slate-800 hover:bg-slate-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                  <FileIcon className="h-5 w-5" />
                </span>
                Document
              </button>
            </div>
          </>
        )}

        <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files, 'photo'); e.target.value = '' }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files, 'photo'); e.target.value = '' }} />
        <input ref={docRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files, 'document'); e.target.value = '' }} />

        <div className="mx-auto flex max-w-3xl items-end gap-2">
          {voiceActive ? (
            <div className="fade-in flex min-h-[2.75rem] flex-1 items-center gap-2 rounded-3xl border border-slate-200 bg-white p-1.5 shadow-sm">
              <button
                type="button"
                onClick={cancelVoice}
                disabled={mode !== 'recording'}
                aria-label="Cancel recording"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40"
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
                    <span className="truncate text-sm text-slate-400">Recording…</span>
                  </>
                ) : (
                  <>
                    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />
                    <span className="text-sm text-slate-500">Sending voice note…</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[2.75rem] flex-1 items-end gap-1 rounded-3xl border border-slate-200 bg-white p-1.5 shadow-sm transition focus-within:border-primary/60">
              <button
                type="button"
                onPointerDown={keepFocus}
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Attach"
                className={`mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                  menuOpen ? 'bg-sky-100 text-primary' : 'text-slate-400 hover:bg-slate-100'
                }`}
              >
                <PaperclipIcon className="h-5 w-5" />
              </button>
              <textarea
                ref={taRef}
                rows={1}
                value={value}
                maxLength={2000}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Message"
                enterKeyHint="send"
                className="max-h-36 min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onPointerDown={keepFocus}
                onClick={() => cameraRef.current?.click()}
                aria-label="Take a photo"
                className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
              >
                <CameraOutlineIcon className="h-5 w-5" />
              </button>
            </div>
          )}

          {voiceActive ? (
            <button
              type="button"
              onClick={finishVoice}
              disabled={mode !== 'recording'}
              aria-label="Send voice note"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition active:scale-95 disabled:opacity-40"
            >
              <StopIcon className="h-4 w-4" />
            </button>
          ) : showMic ? (
            <button
              type="button"
              onPointerDown={keepFocus}
              onClick={startVoice}
              aria-label="Record a voice note"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition active:scale-95"
            >
              <MicIcon className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              onPointerDown={keepFocus}
              onClick={submit}
              disabled={!hasText}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition active:scale-95 disabled:opacity-40"
            >
              <SendIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {pending.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-900" role="dialog" aria-modal="true">
          <header className="flex items-center gap-3 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white">
            <button type="button" onClick={closePreview} aria-label="Cancel" className="rounded-full p-2 hover:bg-white/10">
              <XIcon className="h-5 w-5" />
            </button>
            <p className="flex-1 text-sm text-white/80">
              {pending.length === 1 ? (pending[0].type === 'image' ? 'Photo' : 'Document') : `${pending.length} files`}
            </p>
          </header>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-4">
            {pending.map((p) =>
              p.type === 'image' ? (
                <div key={p.id} className="relative">
                  <img src={p.preview} alt="" className={`rounded-xl object-contain ${pending.length === 1 ? 'max-h-[60dvh]' : 'max-h-40'} max-w-full`} />
                  {pending.length > 1 && (
                    <button type="button" onClick={() => removePending(p.id)} aria-label="Remove" className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white">
                      <XIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : (
                <div key={p.id} className="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-white/10 p-4 text-white">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
                    <FileIcon className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.file.name}</p>
                    <p className="text-xs text-white/60">
                      {fileExtension(p.file.name).toUpperCase() || 'FILE'} · {formatFileSize(p.file.size)}
                    </p>
                  </div>
                  {pending.length > 1 && (
                    <button type="button" onClick={() => removePending(p.id)} aria-label="Remove">
                      <XIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )
            )}
          </div>

          <div className="flex items-end gap-2 bg-slate-900 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2">
            <textarea
              rows={1}
              value={caption}
              maxLength={1000}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption…"
              className="max-h-28 min-h-[2.75rem] flex-1 resize-none rounded-3xl bg-white/10 px-4 py-2.5 text-base text-white outline-none placeholder:text-white/50"
            />
            <button
              type="button"
              onClick={sendPending}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white active:scale-95"
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
