import { useEffect } from 'react'
import { messagePreview } from '../../lib/messageUtils'
import { ShareIcon, TrashIcon } from '../../components/Icons'
import { CopyIcon, DownloadIcon, ReplyIcon, StarIcon } from '../../components/ChatIcons'

const REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '🔥']

function Row({ icon, label, onClick, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] hover:bg-slate-50 active:bg-slate-100 ${
        danger ? 'text-red-600' : 'text-slate-800'
      }`}
    >
      <span className="text-slate-500">{icon}</span>
      <span className={danger ? 'text-red-600' : ''}>{label}</span>
    </button>
  )
}

export default function MessageSheet({
  msg,
  onClose,
  onReply,
  onCopy,
  onReact,
  onStar,
  onShare,
  onSaveImage,
  onDelete,
}) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="fade-in absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="sheet-in relative w-full max-w-md rounded-t-3xl bg-white p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

        <div className="mb-2 flex items-center justify-between gap-1 rounded-2xl bg-slate-50 px-2 py-1.5">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(msg, emoji)}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-2xl transition active:scale-90 ${
                msg.reaction === emoji ? 'bg-sky-100 ring-2 ring-primary/40' : 'hover:bg-slate-100'
              }`}
              aria-label={`React ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        <p className="mx-1 mb-1 line-clamp-2 text-xs text-slate-400">{messagePreview(msg)}</p>

        <Row icon={<ReplyIcon />} label="Reply" onClick={() => onReply(msg)} />
        {msg.content && <Row icon={<CopyIcon />} label="Copy text" onClick={() => onCopy(msg)} />}
        <Row
          icon={<StarIcon filled={!!msg.starred} className={`h-5 w-5 ${msg.starred ? 'text-amber-400' : ''}`} />}
          label={msg.starred ? 'Remove star' : 'Star'}
          onClick={() => onStar(msg)}
        />
        {msg.image_url && <Row icon={<DownloadIcon />} label="Save picture" onClick={() => onSaveImage(msg)} />}
        {canShare && <Row icon={<ShareIcon className="h-5 w-5" />} label="Share" onClick={() => onShare(msg)} />}
        <Row icon={<TrashIcon className="h-5 w-5" />} label="Delete" danger onClick={() => onDelete(msg)} />
      </div>
    </div>
  )
}