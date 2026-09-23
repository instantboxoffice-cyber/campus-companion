import { useNavigate } from 'react-router-dom'
import { BellIcon, ChatBubbleIcon, PhoneIcon, UpdatesIcon } from './Icons'

// "Communities" doesn't map to anything this app has (there's one
// companion, not a directory of groups), so that slot is used for
// Reminders instead - a real, already-built feature - rather than a
// fourth placeholder tab.
const TABS = [
  { key: 'chats', label: 'Chats', path: '/', icon: ChatBubbleIcon },
  { key: 'updates', label: 'Updates', path: '/updates', icon: UpdatesIcon },
  { key: 'reminders', label: 'Reminders', path: '/reminders', icon: BellIcon },
  { key: 'calls', label: 'Calls', path: '/calls', icon: PhoneIcon },
]

export default function BottomNav({ active }) {
  const navigate = useNavigate()

  return (
    <nav className="flex items-stretch border-t border-white/10 bg-primary-dark pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ key, label, path, icon: Icon }) => {
        const isActive = key === active
        return (
          <button
            key={key}
            onClick={() => navigate(path)}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs transition ${
              isActive ? 'text-primary' : 'text-white/50'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className={isActive ? 'font-medium' : ''}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}