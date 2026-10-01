import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { messagePreview } from '../../lib/messageUtils'
import { SendIcon, XIcon } from '../../components/Icons'
import { TextFormatIcon } from '../../components/ChatIcons'

// The typing box lives in its own component on purpose: every keystroke
// only re-renders THIS small box, not the whole message list. That is what
// keeps typing instant even in a long chat.
export default function Composer({ ref, onSend, busy, replyTo, onCancelReply }) {
  const [value, setValue] = useState('')
  const [showFormat, setShowFormat] = useState(false)
  const taRef = useRef(null)

  useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus() }), [])

  // Grows the box as you type (up to about 6 lines), then scrolls inside.
  useLayoutEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`
  }, [value])

  function submit() {
    const text = value.trim()
    if (!text || busy) return
    if (onSend(text)) {
      setValue('')
      taRef.current?.focus()
    }
  }

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

  const canSend = value.trim().length > 0 && !busy

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

        {showFormat && (
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
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Companion…"
            enterKeyHint="send"
            className="max-h-36 min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none placeholder:text-slate-400"
          />

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
        </div>
      </div>
    </div>
  )
}