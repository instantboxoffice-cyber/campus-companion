import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { registerPushNotifications } from '../../lib/pushNotifications'
import Avatar from '../../components/Avatar'
import { BackArrowIcon, CheckIcon, MoreVerticalIcon, SendIcon } from '../../components/Icons'

function formatBubbleTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function ChatPage() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [userId, setUserId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const nextUserId = user?.id ?? null
      setUserId(nextUserId)

      if (nextUserId) {
        registerPushNotifications(supabase, nextUserId).catch((error) => {
          console.error('Push registration error:', error)
        })
      }
    })
  }, [])

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
  }, [userId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  async function handleSend(e) {
    e.preventDefault()
    if (!input.trim() || sending) return

    setSending(true)
    const userText = input.trim()
    setInput('')

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

    setMessages((prev) => [...prev, userMsg])

    const history = [...messages, userMsg]
      .slice(-10)
      .map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.content,
      }))

    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session.access_token

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-reminder`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ history }),
      }
    )
    const parsed = await res.json()

    let companionReply = "Hmm, something went wrong on my end — mind trying that again?"

    if (parsed.reply) {
      companionReply = parsed.reply

      if (parsed.intent === 'reminder' && parsed.task && parsed.due_at) {
        await supabase.from('reminders').insert({
          user_id: userId,
          task: parsed.task,
          due_at: parsed.due_at,
          recurrence: parsed.recurrence,
        })
      }
    }

    const { data: companionMsg } = await supabase
      .from('messages')
      .insert({ user_id: userId, sender: 'companion', content: companionReply })
      .select()
      .single()

    if (companionMsg) setMessages((prev) => [...prev, companionMsg])

    setSending(false)
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

        <Avatar label="C" size="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">Campus Companion</p>
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
