import { useLocation, useNavigate } from 'react-router-dom'
import { CallsIcon, CommunitiesIcon, MessageIcon, UpdatesIcon } from './Icons'

const tabs = [
  { label: 'Chats', path: '/', Icon: MessageIcon },
  { label: 'Updates', path: '/updates', Icon: UpdatesIcon },
  { label: 'Communities', path: '/communities', Icon: CommunitiesIcon },
  { label: 'Calls', path: '/calls', Icon: CallsIcon },
]

export default function BottomNav({ hasUnread = false }) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="shrink-0 border-t border-slate-700/80 bg-slate-900 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2 text-slate-400">
      <div className="mx-auto flex max-w-lg items-end justify-around">
        {tabs.map(({ label, path, Icon }) => {
          const active = location.pathname === path
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`relative flex min-w-16 flex-col items-center gap-1 rounded-xl px-2 py-1 text-[11px] transition ${
                active ? 'font-semibold text-white' : 'hover:text-slate-200'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <span className={`flex h-8 w-14 items-center justify-center rounded-full ${active ? 'bg-sky-500/25' : ''}`}>
                <Icon className="h-5 w-5" />
                {label === 'Chats' && hasUnread && (
                  <span className="absolute right-3 top-0 h-2.5 w-2.5 rounded-full bg-sky-400 ring-2 ring-slate-900" aria-label="Unread chats" />
                )}
              </span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
