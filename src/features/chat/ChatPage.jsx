import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { registerPushNotifications } from '../../lib/pushNotifications'

export default function ChatPage() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [userId, setUserId] = useState(null)

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

  useEffect(() => {
    if (!userId) return
    loadMessages()
  }, [userId])

  async function loadMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })

    if (!error) setMessages(data)
  }

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
  }

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-primary-dark px-4 py-3 text-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-sky-200">
              C
            </div>
            <div>
              <h1 className="text-lg font-semibold">Campus Companion</h1>
              <p className="text-xs text-sky-200">Online now</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => navigate('/reminders')} className="rounded-full border border-white/20 px-3 py-1.5 transition hover:bg-white/10">
              Reminders
            </button>
            <button onClick={handleLogout} className="rounded-full border border-white/20 px-3 py-1.5 transition hover:bg-white/10">
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col bg-white shadow-[0_0_0_1px_rgba(148,163,184,0.1)]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span>AI Companion</span>
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">Ready</span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),transparent_30%)] p-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                  msg.sender === 'user'
                    ? 'bg-primary text-white'
                    : 'bg-bubble-received text-slate-800'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-bubble-received px-4 py-2.5 text-sm text-slate-600">
                Thinking...
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="border-t border-slate-200 bg-white p-3">
          <div className="mx-auto flex max-w-5xl gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me to remind you about something..."
              className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-sky-100"
              disabled={sending}
            />

            <button
              type="submit"
              disabled={sending}
              className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}