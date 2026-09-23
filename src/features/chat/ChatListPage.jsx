import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import Avatar from '../../components/Avatar'
import BottomNav from '../../components/BottomNav'
import { useComingSoonToast } from '../../components/ComingSoonToast'
import { CameraIcon, MoreVerticalIcon, SearchIcon } from '../../components/Icons'
import companionAvatar from '../../assets/companion-avatar.png'

const LAST_READ_KEY = 'companion_last_read_at'

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

function isUnread(message) {
  if (!message || message.sender !== 'companion') return false
  const lastReadAt = localStorage.getItem(LAST_READ_KEY)
  if (!lastReadAt) return true
  return new Date(message.created_at) > new Date(lastReadAt)
}

export default function ChatListPage() {
  const navigate = useNavigate()
  const [lastMessage, setLastMessage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [unread, setUnread] = useState(false)
  const [filter, setFilter] = useState('all') // 'all' | 'unread'
  const [toast, showToast] = useComingSoonToast()

  useEffect(() => {
    async function loadLastMessage() {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)

      if (!error) {
        const latest = data?.[0] ?? null
        setLastMessage(latest)
        setUnread(isUnread(latest))
      }
      setLoading(false)
    }

    loadLastMessage()

    // Live-updates the preview the moment a new message lands - whether
    // it's the companion's reply finishing in the background or a
    // message sent from another device - no reopening the chat needed.
    const channel = supabase
      .channel('chat-list-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setLastMessage(payload.new)
          setUnread(isUnread(payload.new))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

  const showChatRow = filter === 'all' || (filter === 'unread' && unread)

  return (
    <div className="app-screen flex flex-col bg-white">
      <header className="bg-primary-dark pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-white">
        <div className="flex items-center justify-between px-4">
          <h1 className="text-2xl font-bold">Campus Companion</h1>
          <div className="flex items-center gap-5">
            <button onClick={() => showToast('Camera coming soon')} aria-label="Camera">
              <CameraIcon className="h-5 w-5 text-white/85" />
            </button>
            <div className="relative">
              <button onClick={() => setMenuOpen((v) => !v)} aria-label="More options">
                <MoreVerticalIcon className="h-5 w-5 text-white/85" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-lg bg-white text-sm text-slate-800 shadow-xl">
                    <button
                      onClick={() => { setMenuOpen(false); showToast('Settings coming soon') }}
                      className="block w-full px-4 py-2.5 text-left hover:bg-slate-50"
                    >
                      Settings
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

        <button
          onClick={() => showToast('Search coming soon')}
          className="mx-4 mt-3 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-left text-white/60"
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          <span className="text-sm">Ask Companion or Search</span>
        </button>

        <div className="mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setFilter('all')}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filter === 'all' ? 'bg-primary text-white' : 'bg-white/10 text-white/70'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filter === 'unread' ? 'bg-primary text-white' : 'bg-white/10 text-white/70'
            }`}
          >
            Unread
          </button>
          <button
            onClick={() => showToast('Groups coming soon')}
            className="shrink-0 rounded-full border border-dashed border-white/25 px-4 py-1.5 text-sm font-medium text-white/40"
          >
            Groups
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Loading...</p>
        ) : showChatRow ? (
          <button
            onClick={() => navigate('/chat')}
            className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50"
          >
            <Avatar src={companionAvatar} alt="Companion" size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">Companion</p>
                <span className={`shrink-0 text-xs ${unread ? 'font-semibold text-primary' : 'text-slate-400'}`}>
                  {formatTimestamp(lastMessage?.created_at)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <p className={`truncate text-sm ${unread ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                  {lastMessage
                    ? `${lastMessage.sender === 'user' ? 'You: ' : ''}${lastMessage.content}`
                    : 'Ask me to remind you about something'}
                </p>
                {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
              </div>
            </div>
          </button>
        ) : (
          <p className="p-6 text-center text-sm text-slate-400">No unread chats.</p>
        )}
      </main>

      {toast}
      <BottomNav active="chats" />
    </div>
  )
}