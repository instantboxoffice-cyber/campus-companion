import { useEffect } from 'react'
import { dmPreview } from '../../lib/dmMedia'
import { TrashIcon } from '../../components/Icons'
import { CopyIcon, DownloadIcon, ReplyIcon } from '../../components/ChatIcons'

function Row({ icon, label, onClick, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] hover:bg-slate-50 active:bg-slate-100 ${
        danger ? 'text-red-600' : 'text-slate-800'
      }`}
    >
      <span className={danger ? 'text-red-500' : 'text-slate-500'}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

export default function DmMessageSheet({ msg, mine, onClose, onReply, onCopy, onSave, onDeleteForMe, onDeleteForEveryone }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const canSave = msg.attachment_type === 'image' || msg.attachment_type === 'file' || msg.attachment_type === 'audio'
  const unsent = msg._sending || msg._failed

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="sheet-in relative w-full max-w-md rounded-t-3xl bg-white p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
        <p className="mx-1 mb-1 line-clamp-2 text-xs text-slate-400">{dmPreview(msg)}</p>

        {!unsent && <Row icon={<ReplyIcon />} label="Reply" onClick={() => onReply(msg)} />}
        {msg.content && <Row icon={<CopyIcon />} label="Copy text" onClick={() => onCopy(msg)} />}
        {canSave && !unsent && <Row icon={<DownloadIcon />} label="Save to device" onClick={() => onSave(msg)} />}
        <Row icon={<TrashIcon className="h-5 w-5" />} label="Delete for me" danger onClick={() => onDeleteForMe(msg)} />
        {mine && !unsent && (
          <Row icon={<TrashIcon className="h-5 w-5" />} label="Delete for everyone" danger onClick={() => onDeleteForEveryone(msg)} />
        )}
      </div>
    </div>
  )
}
