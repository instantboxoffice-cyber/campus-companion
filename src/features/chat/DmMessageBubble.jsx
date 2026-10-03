import { memo, useEffect, useRef, useState } from 'react'
import FormattedText from '../../lib/formatText'
import { formatBubbleTime } from '../../lib/messageUtils'
import { fileExtension, forgetDmFileUrl, formatFileSize, getDmFileUrl } from '../../lib/dmMedia'
import MessageTicks from '../../components/MessageTicks'
import { ChevronDownIcon, DownloadIcon, FileIcon, ReplyIcon } from '../../components/ChatIcons'
import VoiceNoteBubble from './VoiceNoteBubble'

const SWIPE_TRIGGER = 56
const LONG_PRESS_MS = 420

// A picture that loads from the private bucket (or shows the local copy while uploading).
function DmImage({ msg, onOpen }) {
  const [url, setUrl] = useState(msg._localUrl || null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (msg._localUrl) {
      setUrl(msg._localUrl)
      return undefined
    }
    let cancelled = false
    getDmFileUrl(msg.attachment_path)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [msg._localUrl, msg.attachment_path])

  return (
    <button
      type="button"
      onClick={() => url && onOpen(msg, url)}
      className="relative block overflow-hidden rounded-xl bg-slate-200"
      aria-label="Open photo"
    >
      {url && !failed ? (
        <img
          src={url}
          alt={msg.attachment_name || 'Photo'}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            forgetDmFileUrl(msg.attachment_path)
            setFailed(true)
          }}
          className={`max-h-80 w-60 max-w-full object-cover transition-opacity duration-300 sm:w-72 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          style={{ minHeight: loaded ? undefined : '10rem' }}
        />
      ) : (
        <div className="flex h-40 w-60 max-w-full items-center justify-center text-xs text-slate-500 sm:w-72">
          {failed ? "Couldn't load photo" : 'Loading…'}
        </div>
      )}
      {msg._sending && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/30">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/60 border-t-white" />
        </span>
      )}
    </button>
  )
}

function DmBubble({
  msg,
  mine,
  startsGroup,
  flash,
  replyAuthor,
  onOpenActions,
  onReply,
  onRetry,
  onJump,
  onOpenImage,
  onOpenFile,
}) {
  const rowRef = useRef(null)
  const hintRef = useRef(null)
  const gesture = useRef({ x: 0, y: 0, moved: false, swiping: false, triggered: false, timer: null })

  // Touch: long-press = actions, swipe right = reply (same feel as WhatsApp).
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

  const type = msg.attachment_type
  const isAudio = type === 'audio'
  const isImage = type === 'image'
  const isFile = type === 'file'

  const quote = msg.reply_preview ? (
    <button
      type="button"
      onClick={() => msg.reply_to_id && onJump(msg.reply_to_id)}
      className={`mb-1.5 block w-full rounded-lg border-l-4 px-2.5 py-1.5 text-left text-xs ${
        mine ? 'border-white/70 bg-white/15 text-white/90' : 'border-primary bg-slate-200/70 text-slate-600'
      }`}
    >
      <span className="block font-semibold">{replyAuthor}</span>
      <span className="line-clamp-2 break-words">{msg.reply_preview}</span>
    </button>
  ) : null

  const fileCard = isFile ? (
    <button
      type="button"
      onClick={() => onOpenFile(msg)}
      className={`flex w-60 max-w-full items-center gap-3 rounded-xl p-2.5 text-left sm:w-72 ${
        mine ? 'bg-white/15' : 'bg-white'
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
          mine ? 'bg-white/20 text-white' : 'bg-sky-100 text-primary'
        }`}
      >
        <FileIcon className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{msg.attachment_name || 'Document'}</span>
        <span className={`block text-xs ${mine ? 'text-white/70' : 'text-slate-500'}`}>
          {fileExtension(msg.attachment_name).toUpperCase() || 'FILE'}
          {msg.attachment_size ? ` · ${formatFileSize(msg.attachment_size)}` : ''}
        </span>
      </span>
      <DownloadIcon className={`h-5 w-5 shrink-0 ${mine ? 'text-white/80' : 'text-slate-400'}`} />
    </button>
  ) : null

  const voice = isAudio ? (
    <VoiceNoteBubble
      localUrl={msg._localUrl}
      path={msg.attachment_path}
      seconds={msg.audio_seconds}
      seed={msg._key || msg.id}
      onPrimary={mine}
      getUrl={getDmFileUrl}
      forgetUrl={forgetDmFileUrl}
    />
  ) : null

  const imageOnly = isImage && !msg.content && !msg.reply_preview

  const meta = (
    <div className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${mine ? 'text-white/70' : 'text-slate-400'}`}>
      {msg._failed ? (
        <button type="button" onClick={() => onRetry(msg)} className="font-medium text-red-200">
          Not sent · Tap to retry
        </button>
      ) : (
        <>
          <span>{formatBubbleTime(msg.created_at)}</span>
          {mine && (
            <MessageTicks sending={!!msg._sending} deliveredAt={msg.delivered_at} readAt={msg.read_at} onPrimary />
          )}
        </>
      )}
    </div>
  )

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
      id={`dm-${msg.id}`}
      className={`msg-row relative ${startsGroup ? 'mt-3' : 'mt-1'} ${flash ? 'msg-flash' : ''} ${msg._fresh ? 'msg-in' : ''}`}
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

      <div ref={rowRef} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        {mine && moreButton}
        <div
          className={`max-w-[85%] break-words rounded-2xl text-[15px] leading-relaxed shadow-sm ${
            imageOnly ? 'p-1' : 'px-3 py-2'
          } ${mine ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md bg-bubble-received text-slate-800'} ${
            msg._sending ? 'opacity-90' : ''
          }`}
        >
          {quote}
          {isImage && <DmImage msg={msg} onOpen={onOpenImage} />}
          {fileCard}
          {voice}
          {msg.content && (
            <div className={isImage || isFile ? 'mt-1.5' : ''}>
              <FormattedText text={msg.content} onPrimary={mine} />
            </div>
          )}
          <div className={imageOnly ? 'px-2 pb-0.5' : ''}>{meta}</div>
        </div>
        {!mine && moreButton}
      </div>
    </div>
  )
}

export default memo(DmBubble)
