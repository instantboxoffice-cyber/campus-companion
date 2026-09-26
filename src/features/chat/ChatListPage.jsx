import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { getLastReadAt, isMessageUnread } from '../../lib/chatRead'
import Avatar from '../../components/Avatar'
import BottomNav from '../../components/BottomNav'
import { useComingSoonToast } from '../../components/ComingSoonToast'
import { CameraIcon, ChatBubbleIcon, MoreVerticalIcon, SearchIcon, XIcon } from '../../components/Icons'
import companionAvatar from '../../assets/companion-avatar.png'

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
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [filter, setFilter] = useState('all') // 'all' | 'unread'
  const [searchQuery, setSearchQuery] = useState('')
  const [toast, showToast] = useComingSoonToast()
  // Three real states, not two: we may still be checking, we may have
  // checked and genuinely found nothing (a brand-new user), or the check
  // itself may have failed (no network, a dropped request, etc). Those
  // last two look completely different to a person and must not share
  // one fallback line - "couldn't check" is not the same as "no messages".
  const [previewStatus, setPreviewStatus] = useState('loading') // 'loading' | 'loaded' | 'error'

  const unread = unreadCount > 0

  const loadLastMessage = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      setPreviewStatus('error')
      return
    }

    setLastMessage(data?.[0] ?? null)
    setPreviewStatus('loaded')
  }, [])

  useEffect(() => {
    async function loadUnreadCount() {
      // Counts companion messages that arrived after the last time this
      // chat was actually open - not just "is the newest message new",
      // so the badge can show a real number instead of a dot.
      const lastReadAt = getLastReadAt()
      let query = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender', 'companion')

      if (lastReadAt) {
        query = query.gt('created_at', lastReadAt)
      }

      const { count, error } = await query
      if (!error) setUnreadCount(count ?? 0)
    }

    loadLastMessage()
    loadUnreadCount()

    // Live-updates the preview the moment a new message lands - whether
    // it's the companion's reply finishing in the background or a
    // message sent from another device - no reopening the chat needed.
    // This subscription is only active while this page is mounted, i.e.
    // while the user is NOT inside the chat itself - so every INSERT it
    // sees here is, by definition, a message the user hasn't viewed yet.
    const channel = supabase
      .channel('chat-list-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setLastMessage(payload.new)
          setPreviewStatus('loaded')
          if (isMessageUnread(payload.new)) {
            setUnreadCount((count) => count + 1)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadLastMessage])

  // The moment the browser tells us the connection is back, try again
  // right away - don't leave the user staring at a stale "couldn't
  // check" (or worse, a wrong "no messages") until they happen to
  // reopen the app.
  useEffect(() => {
    function handleOnline() {
      loadLastMessage()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [loadLastMessage])

  // A failed request isn't always because the browser is fully offline
  // (navigator can say "online" while a request still times out) - so on
  // top of the online-event retry above, try once more a few seconds
  // later on its own.
  useEffect(() => {
    if (previewStatus !== 'error') return
    const timeoutId = setTimeout(loadLastMessage, 4000)
    return () => clearTimeout(timeoutId)
  }, [previewStatus, loadLastMessage])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

  function openChat() {
    // Optimistic - the real read-marker gets written from inside the
    // chat itself (using the messages' own server timestamps), this just
    // clears the badge instantly instead of waiting on that round trip.
    setUnreadCount(0)
    navigate('/chat')
  }

  function askCompanion(query) {
    // Sends the search text straight into the Companion DM as a real
    // message - the same effect as opening the chat and typing it in.
    navigate('/chat', { state: { forwardedQuery: query } })
  }

  const trimmedQuery = searchQuery.trim()
  const isSearching = trimmedQuery.length > 0
  const lowerQuery = trimmedQuery.toLowerCase()

  // There's only ever one conversation in this app (Companion), so
  // "searching chats" means: does its name or its latest message match?
  const chatMatchesSearch =
    isSearching &&
    ('companion'.includes(lowerQuery) || (lastMessage?.content ?? '').toLowerCase().includes(lowerQuery))

  const showChatRow = !isSearching && (filter === 'all' || (filter === 'unread' && unread))

  let previewText = ''
  if (previewStatus === 'error') {
    previewText = "Couldn't load — check your connection"
  } else if (previewStatus === 'loaded') {
    previewText = lastMessage
      ? `${lastMessage.sender === 'user' ? 'You: ' : ''}${lastMessage.content}`
      : 'Ask me to remind you about something'
  }
  // While previewStatus is 'loading', previewText stays '' - an honest
  // blank beats confidently claiming either "no messages" or an error
  // before we've actually found out which one is true.

  const chatRow = (
    <button
      onClick={openChat}
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
          <p
            className={`truncate text-sm ${
              previewStatus === 'error'
                ? 'italic text-amber-600'
                : unread
                  ? 'font-semibold text-slate-900'
                  : 'text-slate-500'
            }`}
          >
            {previewText}
          </p>
          {unread && (
            <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )

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

        <div className="mx-4 mt-3 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-white/60 focus-within:bg-white/15">
          <SearchIcon className="h-4 w-4 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ask Companion or Search"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/60 focus:outline-none"
          />
          {isSearching && (
            <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="shrink-0">
              <XIcon className="h-4 w-4 text-white/70" />
            </button>
          )}
        </div>

        {!isSearching && (
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
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        {isSearching ? (
          <>
            <button
              onClick={() => askCompanion(trimmedQuery)}
              className="flex w-full items-center gap-3 border-b border-slate-100 bg-primary/5 px-4 py-3 text-left transition hover:bg-primary/10"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <ChatBubbleIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">Ask Companion</p>
                <p className="truncate text-sm text-primary">&ldquo;{trimmedQuery}&rdquo;</p>
              </div>
            </button>

            <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Chats
            </p>
            {chatMatchesSearch ? (
              chatRow
            ) : (
              <p className="px-4 pb-6 text-sm text-slate-400">No chats found.</p>
            )}
          </>
        ) : showChatRow ? (
          chatRow
        ) : (
          <p className="p-6 text-center text-sm text-slate-400">No unread chats.</p>
        )}
      </main>

      {toast}
      <BottomNav active="chats" />
    </div>
  )
}