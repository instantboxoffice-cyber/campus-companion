import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { registerPushNotifications } from '../../lib/pushNotifications'
import Avatar from '../../components/Avatar'
import BottomNav from '../../components/BottomNav'
import CampusCompanionIcon from '../../components/CampusCompanionIcon'
import {
  ArchiveIcon,
  CameraIcon,
  MoreVerticalIcon,
  PinIcon,
  SearchIcon,
} from '../../components/Icons'

const LAST_READ_KEY = 'companion_last_read_at'
const filters = ['All', 'Unread', 'Favourites', 'Groups']

function formatTimestamp(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const now = new Date()
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function isUnread(message) {
  if (!message || message.sender !== 'companion') return false
  const lastReadAt = localStorage.getItem(LAST_READ_KEY)
  return !lastReadAt || new Date(message.created_at) > new Date(lastReadAt)
}

export default function ChatListPage() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('All')
  const searchInputRef = useRef(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      registerPushNotifications(supabase, user.id).catch((error) => {
        console.warn('Push registration unavailable:', error)
      })
    })
  }, [])

  useEffect(() => {
    async function loadMessages() {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error) setMessages(data ?? [])
    }

    loadMessages()

    const channel = supabase
      .channel('chat-list-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((previous) => [payload.new, ...previous.filter((message) => message.id !== payload.new.id)])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const lastMessage = messages[0] ?? null
  const unread = isUnread(lastMessage)
  const normalizedSearch = search.trim().toLowerCase()
  const searchResults = useMemo(
    () => normalizedSearch
      ? messages.filter((message) => message.content?.toLowerCase().includes(normalizedSearch))
      : [],
    [messages, normalizedSearch]
  )
  const showChat = activeFilter === 'All' || (activeFilter === 'Unread' && unread)

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

  return (
    <div className="app-screen relative flex flex-col bg-slate-950 text-white">
      <header className="bg-slate-900 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Chats</h1>
          <div className="flex items-center gap-5">
            <button aria-label="Camera (coming soon)" className="text-slate-200">
              <CameraIcon className="h-5 w-5" />
            </button>
            <button
              aria-label="Focus search"
              onClick={() => searchInputRef.current?.focus()}
              className="text-slate-200"
            >
              <SearchIcon className="h-5 w-5" />
            </button>
            <div className="relative">
              <button onClick={() => setMenuOpen((value) => !value)} aria-label="More options">
                <MoreVerticalIcon className="h-5 w-5 text-slate-200" />
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
                    <button onClick={handleLogout} className="block w-full px-4 py-2.5 text-left text-red-600 hover:bg-slate-50">
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <label className="mt-4 flex items-center gap-3 rounded-full bg-slate-800 px-4 py-2.5 text-slate-400">
          <SearchIcon className="h-5 w-5 shrink-0" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ask Companion or Search"
            aria-label="Ask Companion or Search"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
          />
        </label>
      </header>

      <div className="flex gap-2 overflow-x-auto bg-slate-950 px-4 py-3">
        {filters.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition ${
              activeFilter === filter
                ? 'border-sky-400 bg-sky-400/15 text-sky-300'
                : 'border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto bg-slate-950">
        {search ? (
          <section>
            <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Message history
            </p>
            {searchResults.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No messages found.</p>
            ) : (
              searchResults.map((message) => (
                <button
                  key={message.id}
                  onClick={() => navigate('/chat')}
                  className="flex w-full gap-3 border-b border-slate-800 px-4 py-3 text-left hover:bg-slate-900"
                >
                  <Avatar label="campus-companion" size="sm" className="bg-sky-500 text-white" />
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-3">
                      <span className="font-medium text-slate-100">Campus Companion</span>
                      <span className="shrink-0 text-xs text-slate-500">{formatTimestamp(message.created_at)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-slate-400">{message.content}</span>
                  </span>
                </button>
              ))
            )}
          </section>
        ) : activeFilter === 'Favourites' || activeFilter === 'Groups' ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">
            {activeFilter} chats will be available when you have more conversations.
          </p>
        ) : (
          <>
            <button className="flex w-full items-center gap-4 border-b border-slate-800 px-4 py-3.5 text-left text-slate-300 hover:bg-slate-900">
              <ArchiveIcon className="h-5 w-5 text-slate-400" />
              <span className="font-medium">Archived</span>
              <span className="ml-auto text-sm text-slate-500">0</span>
            </button>
            {showChat ? (
              <button
                onClick={() => navigate('/chat')}
                className="flex w-full items-center gap-3 border-b border-slate-800 px-4 py-3 text-left transition hover:bg-slate-900"
              >
                <Avatar label="campus-companion" size="md" className="bg-sky-500 text-white" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-100">Campus Companion</span>
                    <span className={`shrink-0 text-xs ${unread ? 'font-semibold text-sky-400' : 'text-slate-500'}`}>
                      {formatTimestamp(lastMessage?.created_at)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${unread ? 'font-semibold text-slate-200' : 'text-slate-400'}`}>
                      {lastMessage ? `${lastMessage.sender === 'user' ? 'You: ' : ''}${lastMessage.content}` : 'Ask me to remind you about something'}
                    </span>
                    {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-400" />}
                  </span>
                </span>
                <PinIcon className="h-4 w-4 shrink-0 text-slate-500" />
              </button>
            ) : (
              <p className="px-6 py-12 text-center text-sm text-slate-500">No unread chats.</p>
            )}
          </>
        )}
      </main>
      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-10 mx-auto flex max-w-lg flex-col items-end gap-2 px-4">
        <button
          type="button"
          aria-label="Add contact"
          className="pointer-events-auto mr-1 flex h-11 w-11 items-center justify-center self-end rounded-full border border-sky-400/50 bg-slate-800 text-sky-300 shadow-lg shadow-slate-950/40 transition hover:bg-slate-700"
        >
          <span className="text-2xl font-light leading-none">+</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/chat')}
          aria-label="Open Campus Companion"
          className="pointer-events-auto flex h-14 w-14 items-center justify-center self-end rounded-full bg-sky-500 text-white shadow-xl shadow-sky-950/50 transition hover:bg-sky-400"
        >
          <CampusCompanionIcon className="h-8 w-8" />
        </button>
      </div>
      <BottomNav hasUnread={unread} />
    </div>
  )
}
