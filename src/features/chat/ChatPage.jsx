import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { registerPushNotifications } from '../../lib/pushNotifications'
import { sounds } from '../../lib/sounds'
import { markReadUpTo } from '../../lib/chatRead'
import Avatar from '../../components/Avatar'
import { BackArrowIcon, CheckIcon, MoreVerticalIcon, SendIcon } from '../../components/Icons'
import companionAvatar from '../../assets/companion-avatar.png'

const SOFT_ASK_DISMISS_KEY = 'notif_soft_ask_dismiss_count'
const DENIED_NOTICE_SEEN_KEY = 'notif_denied_notice_seen'
const MAX_SOFT_ASKS = 3

function formatBubbleTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function canRequestNotificationPermission() {
  return (
    window.isSecureContext &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export default function ChatPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [userId, setUserId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [showSoftAsk, setShowSoftAsk] = useState(false)
  const [showDeniedNotice, setShowDeniedNotice] = useState(false)
  const scrollRef = useRef(null)
  const hasOpenedChatRef = useRef(true)
  const forwardedQueryHandledRef = useRef(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const nextUserId = user?.id ?? null
      setUserId(nextUserId)

      if (nextUserId) {
        registerPushNotifications(supabase, nextUserId)
          .then((result) => {
            if (!result.enabled) {
              console.info('Push notifications were not enabled:', result.reason)
            }
          })
          .catch((error) => {
            console.error('Push registration error:', error)
          })
      }
    })
  }, [])

  useEffect(() => {
    if (!canRequestNotificationPermission()) return
    if (Notification.permission !== 'denied') return
    if (localStorage.getItem(DENIED_NOTICE_SEEN_KEY)) return
    setShowDeniedNotice(true)
  }, [])

  async function requestAndRegisterNotifications() {
    if (!canRequestNotificationPermission()) {
      console.warn('This browser/context does not support push notifications.')
      return
    }

    const permission = await Notification.requestPermission()
    setNotifPermission(permission)

    if (permission === 'granted') {
      const result = await registerPushNotifications(supabase, userId)
      if (!result.enabled) {
        console.info('Push notifications were not enabled:', result.reason)
      }
    }
  }

  async function handleEnableNotifications() {
    setMenuOpen(false)

    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications.')
      return
    }

    if (Notification.permission === 'denied') {
      console.warn('Notification permission was denied. Enable notifications in the browser settings.')
      return
    }

    if (Notification.permission === 'granted') {
      const result = await registerPushNotifications(supabase, userId)
      if (!result.enabled) {
        console.info('Push notifications were not enabled:', result.reason)
      }
      return
    }

    await requestAndRegisterNotifications()
  }

  function handleToggleMute() {
    const next = sounds.toggleMuted()
    setMuted(next)
    setMenuOpen(false)
  }

  async function loadMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })

    if (!error) setMessages(data)
  }

  useEffect(() => {
    if (!userId) return
    loadMessages()

    const channel = supabase
      .channel('chat-page-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev
            // Covers both a live companion reply and a reminder firing
            // while the chat happens to be open - both arrive as a real
            // INSERT here, so this is the one place that needs to play
            // the "received" sound rather than duplicating it wherever
            // a companion message might originate.
            if (payload.new.sender === 'companion') sounds.received()
            return [...prev, payload.new]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  // Picks up a question forwarded here from the Chats-tab search bar
  // (navigate('/chat', { state: { forwardedQuery } })) and sends it as a
  // real message, the same as if it had been typed and submitted here.
  // The ref guard matters in dev: React 18 StrictMode runs this effect
  // twice on mount, and without it that would send the question twice.
  useEffect(() => {
    if (!userId) return
    if (forwardedQueryHandledRef.current) return
    const forwardedQuery = location.state?.forwardedQuery
    if (!forwardedQuery) return

    forwardedQueryHandledRef.current = true
    sendMessage(forwardedQuery)
    // Clear the navigation state so coming back to /chat later (back
    // button, refresh) doesn't resend the same forwarded question.
    navigate(location.pathname, { replace: true, state: null })
    // Deliberately keyed only on [userId, location.state]: `navigate` is
    // stable, `location.pathname` doesn't change on this page, and
    // `sendMessage` is a new function every render - the ref guard above
    // (not this dependency array) is what prevents this from re-firing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, location.state])

  useEffect(() => {
    if (!scrollRef.current) return

    // Opening the chat should jump straight to the bottom instantly, like
    // WhatsApp. Only messages that arrive AFTER that first load should
    // animate smoothly into view.
    const behavior = hasOpenedChatRef.current ? 'auto' : 'smooth'
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior })

    if (messages.length > 0) {
      hasOpenedChatRef.current = false
      // Mark as read using the LAST MESSAGE'S OWN server timestamp, not
      // a client-side "now" reading - see chatRead.js for why that
      // distinction matters. `messages` is loaded/appended in
      // created_at order, so the final entry is always the newest.
      markReadUpTo(messages[messages.length - 1].created_at)
    }
  }, [messages, sending])

  async function sendMessage(rawText) {
    const userText = rawText.trim()
    if (!userText || sending) return

    sounds.sent()
    setSending(true)

    const { data: userMsg, error: userMsgError } = await supabase
      .from('messages')
      .insert({ user_id: userId, sender: 'user', content: userText })
      .select()
      .single()

    if (userMsgError) {
      console.error(userMsgError)
      setSending(false)
      return
    }

    setMessages((prev) => (prev.some((m) => m.id === userMsg.id) ? prev : [...prev, userMsg]))

    const history = [...messages, userMsg]
      .slice(-10)
      .map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.content,
      }))

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const localTime = new Date()
      .toLocaleString('sv-SE', { timeZone: timezone })
      .replace(' ', 'T')

    // IMPORTANT: this must go through supabase.functions.invoke(), not a
    // plain fetch('/functions/v1/parse-reminder', ...). A relative URL like
    // that resolves against THIS SITE's own origin, not Supabase - and
    // vercel.json's catch-all rewrite ("/(.*)" -> "/index.html") then sends
    // that POST request to the static index.html file instead. Vercel only
    // serves static files on GET/HEAD, so the POST comes back as an empty
    // 405 response, which is why res.json() used to blow up with
    // "Unexpected end of JSON input" and the companion looked like it had
    // stopped replying. functions.invoke() builds the correct absolute
    // Supabase URL itself and attaches the current session's auth token,
    // so this never hits our own site at all.
    const { data: parsed, error: invokeError } = await supabase.functions.invoke(
      'parse-reminder',
      { body: { history, timezone, localTime } }
    )

    if (invokeError) {
      console.error('parse-reminder failed', invokeError)
    }

    const companionMsg = parsed?.message ?? {
      id: crypto.randomUUID(),
      user_id: userId,
      sender: 'companion',
      content: parsed?.reply || "Hmm, something went wrong on my end — mind trying that again?",
      created_at: new Date().toISOString(),
    }

    setMessages((prev) =>
      prev.some((m) => m.id === companionMsg.id) ? prev : [...prev, companionMsg]
    )
    setSending(false)

    if (
      parsed?.intent === 'reminder' &&
      canRequestNotificationPermission() &&
      Notification.permission === 'default'
    ) {
      const dismissCount = Number(localStorage.getItem(SOFT_ASK_DISMISS_KEY) || 0)
      if (dismissCount < MAX_SOFT_ASKS) {
        setShowSoftAsk(true)
      }
    }
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!input.trim() || sending) return
    const userText = input.trim()
    setInput('')
    await sendMessage(userText)
  }

  function dismissSoftAsk() {
    const count = Number(localStorage.getItem(SOFT_ASK_DISMISS_KEY) || 0) + 1
    localStorage.setItem(SOFT_ASK_DISMISS_KEY, String(count))
    setShowSoftAsk(false)
  }

  async function acceptSoftAsk() {
    setShowSoftAsk(false)
    await requestAndRegisterNotifications()
  }

  function dismissDeniedNotice() {
    localStorage.setItem(DENIED_NOTICE_SEEN_KEY, '1')
    setShowDeniedNotice(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

  return (
    <div className="app-screen flex flex-col overflow-hidden">
      <header className="flex items-center gap-3 bg-primary-dark px-3 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)] text-white">
        <button onClick={() => navigate('/')} aria-label="Back to chats">
          <BackArrowIcon className="h-5 w-5 text-white/90" />
        </button>

        <Avatar src={companionAvatar} alt="Companion" size="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">Companion</p>
          <p className="text-xs leading-tight text-sky-200/80">
            {sending ? 'typing…' : 'online'}
          </p>
        </div>

        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} aria-label="More options">
            <MoreVerticalIcon className="h-5 w-5 text-white/90" />
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
                  onClick={handleToggleMute}
                  className="block w-full px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  {muted ? 'Unmute sounds' : 'Mute sounds'}
                </button>
                {notifPermission === 'granted' ? (
                  <div className="block w-full px-4 py-2.5 text-left text-slate-400">
                    Notifications on
                  </div>
                ) : (
                  <button
                    onClick={handleEnableNotifications}
                    className="block w-full px-4 py-2.5 text-left hover:bg-slate-50"
                  >
                    Enable notifications
                  </button>
                )}
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
      </header>

      {showSoftAsk && (
        <div className="mx-3 mt-2 flex items-center justify-between rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <span>Want a text the moment this is due?</span>
          <div className="flex gap-3">
            <button onClick={dismissSoftAsk} className="text-slate-500">
              Not now
            </button>
            <button onClick={acceptSoftAsk} className="font-medium text-primary">
              Turn on
            </button>
          </div>
        </div>
      )}

      {showDeniedNotice && (
        <div className="mx-3 mt-2 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>Notifications are off — enable them in your browser's site settings to get reminder texts.</span>
          <button onClick={dismissDeniedNotice} className="font-medium text-amber-700">
            Got it
          </button>
        </div>
      )}

      <main ref={scrollRef} className="chat-wallpaper flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-2.5">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user'
            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] rounded-xl px-3 pb-1.5 pt-2 text-sm shadow-sm ${
                    isUser
                      ? 'bubble-tail-sent bg-primary text-white'
                      : 'bubble-tail-received bg-bubble-received text-slate-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${isUser ? 'text-sky-100/80' : 'text-slate-400'}`}>
                    <span>{formatBubbleTime(msg.created_at)}</span>
                    {isUser && <CheckIcon className="h-3 w-3" />}
                  </div>
                </div>
              </div>
            )
          })}

          {sending && (
            <div className="flex justify-start">
              <div className="bubble-tail-received flex items-center gap-1 rounded-xl bg-bubble-received px-3 py-2.5 shadow-sm">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
              </div>
            </div>
          )}
        </div>
      </main>

      <form
        onSubmit={handleSend}
        className="flex items-end gap-2 bg-slate-100 p-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)]"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message"
          className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-base outline-none transition focus:border-primary"
          disabled={sending}
        />

        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SendIcon className="h-4.5 w-4.5" />
        </button>
      </form>
    </div>
  )
}