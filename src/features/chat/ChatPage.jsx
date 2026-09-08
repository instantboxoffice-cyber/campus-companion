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

    // Build conversation history for Groq: last 10 messages, mapped to role/content
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
    <div className="flex flex-col h-screen bg-white">
      <div className="bg-primary-dark text-white p-4 flex justify-between items-center gap-3">
        <h1 className="font-bold">Campus Companion</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/reminders')} className="text-sm underline">Reminders</button>
          <button onClick={handleLogout} className="text-sm underline">Log out</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`max-w-[75%] p-3 rounded-lg ${
              msg.sender === 'user'
                ? 'bg-primary text-white ml-auto'
                : 'bg-bubble-received text-black'
            }`}
          >
            {msg.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="p-4 border-t flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. remind me to submit the assignment by 6pm tomorrow"
          className="flex-1 border rounded-lg px-3 py-2"
          disabled={sending}
        />

        <button
          type="submit"
          disabled={sending}
          className="bg-primary text-white px-4 py-2 rounded-lg"
        >
          {sending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  )
}