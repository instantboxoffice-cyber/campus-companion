import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { sounds } from '../../lib/sounds'
import { dayLabel, formatBubbleTime, isSameDay } from '../../lib/messageUtils'
import FormattedText from '../../lib/formatText'
import Avatar from '../../components/Avatar'
import { BackArrowIcon, CheckIcon, DoubleCheckIcon, SendIcon } from '../../components/Icons'
import { ClockIcon } from '../../components/ChatIcons'
import { useComingSoonToast } from '../../components/ComingSoonToast'

const PAGE_SIZE = 100
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function DirectChatPage() {
  const { friendId } = useParams()
  const navigate = useNavigate()
  const [toast, showToast] = useComingSoonToast()
  const [myId, setMyId] = useState(null)
  const [other, setOther] = useState(undefined) // undefined = loading, null = not found
  const [messages, setMessages] = useState([])
  const [loadState, setLoadState] = useState('loading')
  const [draft, setDraft] = useState('')
  const bottomRef = useRef(null)
  const validId = UUID_RE.test(friendId ?? '')

  useEffect(() => {
    if (!validId) return
    supabase.auth.getSession().then(({ data: { session } }) => setMyId(session?.user?.id ?? null))
    supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .eq('id', friendId)
      .maybeSingle()
      .then(({ data }) => setOther(data ?? null))
  }, [friendId, validId])

  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible') return
    supabase.rpc('mark_dms_read', { other_id: friendId })
  }, [friendId])

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`sender_id.eq.${friendId},recipient_id.eq.${friendId}`)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (error) {
      setLoadState('error')
      return
    }
    const rows = data.reverse()
    // keep anything still sending or failed; the server copy replaces the rest
    setMessages((prev) => [...rows, ...prev.filter((m) => m._sending || m._failed)])
    setLoadState('ready')
    markRead()
  }, [friendId, markRead])

  useEffect(() => {
    if (!myId || !validId) return

    const channel = supabase
      .channel(`dm-thread-${friendId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (payload) => {
        const row = payload.new
        const inThisChat =
          (row.sender_id === friendId && row.recipient_id === myId) ||
          (row.sender_id === myId && row.recipient_id === friendId)
        if (!inThisChat) return
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
        if (row.sender_id === friendId) {
          sounds.received()
          markRead()
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages' }, (payload) => {
        setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m)))
      })
      // Also re-syncs after any reconnect, so nothing is missed while offline
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') loadMessages()
      })

    const onVisible = () => markRead()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [myId, friendId, validId, loadMessages, markRead])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  async function sendText(text, replaceId) {
    const tempId = crypto.randomUUID()
    setMessages((prev) => [
      ...prev.filter((m) => m.id !== replaceId),
      {
        id: tempId,
        sender_id: myId,
        recipient_id: friendId,
        content: text,
        created_at: new Date().toISOString(),
        read_at: null,
        _sending: true,
      },
    ])
    sounds.sent()

    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ sender_id: myId, recipient_id: friendId, content: text })
      .select()
      .single()

    setMessages((prev) => {
      if (error) {
        // 42501 = the database refused it, i.e. you're not friends (any more)
        if (error.code === '42501') return prev.filter((m) => m.id !== tempId)
        return prev.map((m) => (m.id === tempId ? { ...m, _sending: false, _failed: true } : m))
      }
      // the live event may already have added the real row
      const withoutTemp = prev.filter((m) => m.id !== tempId)
      return withoutTemp.some((m) => m.id === data.id) ? withoutTemp : [...withoutTemp, data]
    })
    if (error?.code === '42501') showToast('You can only message friends')
  }

  function submit() {
    const text = draft.trim()
    if (!text || !myId) return
    setDraft('')
    sendText(text)
  }

  function handleKeyDown(e) {
    // Enter sends on desktop; on phones it stays a new line like WhatsApp
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault()
      submit()
    }
  }

  if (!validId || other === null) {
    return (
      <div className="app-screen flex flex-col items-center justify-center gap-3 bg-white p-6 text-center">
        <p className="text-slate-500">This person isn&apos;t available.</p>
        <button onClick={() => navigate('/')} className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white">
          Back to chats
        </button>
      </div>
    )
  }

  const name = other?.username ?? ''

  return (
    <div className="app-screen flex flex-col bg-white">
      <header className="flex items-center gap-3 bg-primary-dark px-3 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
        <button onClick={() => navigate('/')} aria-label="Back">
          <BackArrowIcon className="h-5 w-5" />
        </button>
        <Avatar src={other?.avatar_url} label={(name[0] ?? '?').toUpperCase()} alt={name} size="sm" />
        <p className="min-w-0 flex-1 truncate font-medium">{name ? `@${name}` : ''}</p>
      </header>

      <main className="chat-wallpaper flex-1 overflow-y-auto px-3 py-3">
        {loadState === 'error' && (
          <p className="py-6 text-center text-sm text-amber-700">Couldn&apos;t load messages - check your connection</p>
        )}
        {loadState === 'ready' && messages.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">No messages yet. Say hi{name ? ` to @${name}` : ''}.</p>
        )}

        {messages.map((msg, i) => {
          const mine = msg.sender_id === myId
          const prev = messages[i - 1]
          const newDay = !prev || !isSameDay(prev.created_at, msg.created_at)
          const startsGroup = newDay || prev.sender_id !== msg.sender_id

          return (
            <div key={msg.id}>
              {newDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-white/80 px-3 py-1 text-xs text-slate-500 shadow-sm">
                    {dayLabel(msg.created_at)}
                  </span>
                </div>
              )}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${startsGroup ? 'mt-3' : 'mt-1'}`}>
                <div className={`flex max-w-[85%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`break-words rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed shadow-sm ${
                      mine ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md bg-bubble-received text-slate-800'
                    } ${msg._sending ? 'opacity-80' : ''}`}
                  >
                    <FormattedText text={msg.content} onPrimary={mine} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                    {msg._failed ? (
                      <button onClick={() => sendText(msg.content, msg.id)} className="font-medium text-red-500">
                        Not sent · Tap to retry
                      </button>
                    ) : (
                      <>
                        <span>{formatBubbleTime(msg.created_at)}</span>
                        {mine &&
                          (msg._sending ? (
                            <ClockIcon />
                          ) : msg.read_at ? (
                            <DoubleCheckIcon className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <CheckIcon className="h-3 w-3" />
                          ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </main>

      <div className="flex items-end gap-2 border-t border-slate-100 bg-white px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={2000}
          placeholder="Message"
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-2.5 text-[15px] text-slate-900 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={!draft.trim()}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </div>

      {toast}
    </div>
  )
}