import { memo, useRef, useState } from 'react'
import FormattedText from '../../lib/formatText'
import { formatBubbleTime } from '../../lib/messageUtils'
import { CheckIcon } from '../../components/Icons'
import { ChevronDownIcon, ClockIcon, ReplyIcon, SpeakerIcon, StarIcon, StopIcon } from '../../components/ChatIcons'
import companionAvatar from '../../assets/companion-avatar.png'

const SWIPE_TRIGGER = 56
const LONG_PRESS_MS = 420

function MessageBubble({
  msg,
  startsGroup,
  endsGroup,
  flash,
  onOpenActions,
  onReply,
  onRetry,
  onJump,
  onOpenImage,
  onSpeak,
  speaking,
}) {
  const isUser = msg.sender === 'user'
  const [imgLoaded, setImgLoaded] = useState(false)
  const rowRef = useRef(null)
  const hintRef = useRef(null)
  const gesture = useRef({ x: 0, y: 0, moved: false, swiping: false, triggered: false, timer: null })

  // ---- touch: long-press = actions, swipe right = reply -------------------
  function handleTouchStart(e) {
    const t = e.touches[0]
    const g = gesture.current
    g.x = t.clientX
    g.y = t.clientY
    g.moved = false
    g.swiping = false
    g.triggered = false
    clearTimeout(g.timer)
    g.timer = setTimeout(() => {
      if (!g.moved) {
        navigator.vibrate?.(15)
        onOpenActions(msg)
      }
    }, LONG_PRESS_MS)
  }

  function handleTouchMove(e) {
    const g = gesture.current
    const t = e.touches[0]
    const dx = t.clientX - g.x
    const dy = t.clientY - g.y

    if (!g.moved && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      g.moved = true
      clearTimeout(g.timer)
      if (Math.abs(dx) > Math.abs(dy) && dx > 0) g.swiping = true
    }

    if (g.swiping && rowRef.current) {
      const shift = Math.max(0, Math.min(dx, 72))
      rowRef.current.style.transform = `translateX(${shift}px)`
      if (hintRef.current) hintRef.current.style.opacity = String(Math.min(shift / SWIPE_TRIGGER, 1))
      if (shift >= SWIPE_TRIGGER && !g.triggered) {
        g.triggered = true
        navigator.vibrate?.(10)
      }
    }
  }

  function handleTouchEnd() {
    const g = gesture.current
    clearTimeout(g.timer)
    if (g.swiping) {
      if (rowRef.current) rowRef.current.style.transform = ''
      if (hintRef.current) hintRef.current.style.opacity = '0'
      if (g.triggered) onReply(msg)
    }
    g.swiping = false
  }

  function handleContextMenu(e) {
    e.preventDefault()
    onOpenActions(msg)
  }

  // ---- pieces -------------------------------------------------------------
  const quote = msg.reply_preview ? (
    <button
      type="button"
      onClick={() => onJump(msg.reply_to_id)}
      className={`mb-1.5 block w-full rounded-lg border-l-4 px-2.5 py-1.5 text-left text-xs ${
        isUser ? 'border-white/70 bg-white/15 text-white/90' : 'border-primary bg-slate-100 text-slate-600'
      }`}
    >
      <span className="block font-semibold">{msg.reply_sender === 'user' ? 'You' : 'Companion'}</span>
      <span className="line-clamp-2 break-words">{msg.reply_preview}</span>
    </button>
  ) : null

  const image = msg.image_url ? (
    <button
      type="button"
      onClick={() => onOpenImage(msg.image_url)}
      className="mb-1.5 block overflow-hidden rounded-2xl bg-slate-200"
      aria-label="Open picture"
    >
      <img
        src={msg.image_url}
        alt="Picture made by Companion"
        loading="lazy"
        decoding="async"
        onLoad={() => setImgLoaded(true)}
        className={`aspect-square w-64 max-w-full object-cover transition-opacity duration-300 sm:w-80 ${
          imgLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </button>
  ) : null

  const reaction = msg.reaction ? (
    <button
      type="button"
      onClick={() => onOpenActions(msg)}
      className="-mt-1 rounded-full border border-slate-200 bg-white px-1.5 text-sm leading-6 shadow-sm"
      aria-label="Reaction"
    >
      {msg.reaction}
    </button>
  ) : null

  const canSpeak = !isUser && !!msg.content
  const showMeta = endsGroup || msg.starred || msg.status === 'failed' || speaking
  const meta = showMeta ? (
    <div
      className={`mt-1 flex items-center gap-1.5 text-[11px] text-slate-400 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {msg.starred && <StarIcon filled className="h-3 w-3 text-amber-400" />}
      {canSpeak && (
        <button
          type="button"
          onClick={() => onSpeak(msg)}
          aria-label={speaking ? 'Stop reading' : 'Listen'}
          className={`flex h-5 w-5 items-center justify-center rounded-full ${
            speaking ? 'bg-sky-100 text-primary' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          {speaking ? <StopIcon className="h-3 w-3" /> : <SpeakerIcon className="h-3.5 w-3.5" />}
        </button>
      )}
      {msg.status === 'failed' ? (
        <button type="button" onClick={() => onRetry(msg)} className="font-medium text-red-500">
          Not sent · Tap to retry
        </button>
      ) : (
        <>
          <span>{formatBubbleTime(msg.created_at)}</span>
          {isUser && (msg.status === 'sending' ? <ClockIcon /> : <CheckIcon className="h-3 w-3" />)}
        </>
      )}
    </div>
  ) : null

  const moreButton = (
    <button
      type="button"
      onClick={() => onOpenActions(msg)}
      className="msg-more mx-1 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm hover:text-slate-800"
      aria-label="Message options"
    >
      <ChevronDownIcon className="h-4 w-4" />
    </button>
  )

  return (
    <div
      id={`msg-${msg.id}`}
      className={`msg-row relative ${startsGroup ? 'mt-4' : 'mt-1'} ${flash ? 'msg-flash' : ''} ${msg._fresh ? 'msg-in' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={handleContextMenu}
    >
      <div
        ref={hintRef}
        className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-slate-200 p-1.5 text-slate-600 opacity-0"
      >
        <ReplyIcon className="h-4 w-4" />
      </div>

      <div ref={rowRef} className={`flex ${isUser ? 'justify-end' : 'items-start gap-2.5'}`}>
        {isUser ? (
          <>
            {moreButton}
            <div className="flex max-w-[85%] flex-col items-end">
              <div
                className={`rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[15px] leading-relaxed text-white shadow-sm ${
                  msg.status === 'sending' ? 'opacity-80' : ''
                }`}
              >
                {quote}
                {image}
                {msg.content && <FormattedText text={msg.content} onPrimary />}
              </div>
              {reaction}
              {meta}
            </div>
          </>
        ) : (
          <>
            <div className="w-7 shrink-0">
              {startsGroup && (
                <img src={companionAvatar} alt="" className="h-7 w-7 rounded-full object-cover" />
              )}
            </div>
            <div className="min-w-0 max-w-[92%]">
              {quote}
              {image}
              {msg.content && (
                <div className="text-[15px] leading-relaxed text-slate-800">
                  <FormattedText text={msg.content} />
                </div>
              )}
              {reaction}
              {meta}
            </div>
            {moreButton}
          </>
        )}
      </div>
    </div>
  )
}

export default memo(MessageBubble)