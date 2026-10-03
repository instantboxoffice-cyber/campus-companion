import Avatar from '../../components/Avatar'
import MessageTicks from '../../components/MessageTicks'

function formatTimestamp(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function previewLine(convo) {
  const text = convo.last_content ?? ''
  if (convo.last_type === 'audio') return '🎤 Voice message'
  if (convo.last_type === 'image') return text ? `📷 ${text}` : '📷 Photo'
  if (convo.last_type === 'file') return `📄 ${text || 'Document'}`
  return text
}

export default function ConversationRow({ convo, onOpen }) {
  const unread = convo.unread_count > 0
  const name = convo.username ?? 'unknown'

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50"
    >
      <Avatar src={convo.avatar_url} label={name[0].toUpperCase()} alt={name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="truncate font-medium text-slate-900">@{name}</p>
          <span className={`shrink-0 text-xs ${unread ? 'font-semibold text-primary' : 'text-slate-400'}`}>
            {formatTimestamp(convo.last_at)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={`truncate text-sm ${unread ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
            {convo.lastFromMe && (
              <span className="mr-1 inline-flex align-middle text-slate-400">
                <MessageTicks deliveredAt={convo.last_delivered_at} readAt={convo.last_read_at} />
              </span>
            )}
            {convo.lastFromMe ? 'You: ' : ''}{previewLine(convo)}
          </p>
          {unread && (
            <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">
              {convo.unread_count > 99 ? '99+' : convo.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}