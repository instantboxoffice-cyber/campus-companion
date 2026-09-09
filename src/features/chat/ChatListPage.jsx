import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import Avatar from '../../components/Avatar'
import { MoreVerticalIcon, SearchIcon } from '../../components/Icons'

function formatTimestamp(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export default function ChatListPage() {
  const navigate = useNavigate()
  const [lastMessage, setLastMessage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    async function loadLastMessage() {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)

      if (!error) setLastMessage(data?.[0] ?? null)
      setLoading(false)
    }

    loadLastMessage()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="bg-primary-dark px-4 pb-3 pt-5 text-white">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Chats</h1>
          <div className="flex items-center gap-4">
            <SearchIcon className="h-5 w-5 text-white/85" />
            <div className="relative">
              <button onClick={() => setMenuOpen((v) => !v)} aria-label="More options">
                <MoreVerticalIcon className="h-5 w-5 text-white/85" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-lg bg-white text-sm text-slate-800 shadow-xl">
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/reminders') }}
                      className="block w-full px-4 py-2.5 text-left hover:bg-slate-50"
                    >
                      Reminders
                    </button>
                    <button
                      onClick={handleLogout}
                      className="block w-full px-4 py-2.5 text-left text-red-600 hover:bg-slate-50"
                    >
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Loading...</p>
        ) : (
          <button
            onClick={() => navigate('/chat')}
            className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50"
          >
            <Avatar label="C" size="md" className="bg-primary text-white" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">Campus Companion</p>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatTimestamp(lastMessage?.created_at)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm text-slate-500">
                {lastMessage
                  ? `${lastMessage.sender === 'user' ? 'You: ' : ''}${lastMessage.content}`
                  : 'Ask me to remind you about something'}
              </p>
            </div>
          </button>
        )}
      </main>
    </div>
  )
}
