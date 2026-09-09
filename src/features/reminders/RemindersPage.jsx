import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { BackArrowIcon, BellIcon, CheckIcon, TrashIcon } from '../../components/Icons'

export default function RemindersPage() {
  const navigate = useNavigate()
  const [reminders, setReminders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadReminders() {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id

      if (!userId) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', userId)
        .order('due_at', { ascending: true })

      if (!error) setReminders(data ?? [])
      setLoading(false)
    }

    loadReminders()
  }, [])

  async function toggleReminder(id, currentDone) {
    const { error } = await supabase
      .from('reminders')
      .update({ completed: !currentDone })
      .eq('id', id)

    if (!error) {
      setReminders((prev) =>
        prev.map((r) => (r.id === id ? { ...r, completed: !currentDone } : r))
      )
    }
  }

  async function deleteReminder(id) {
    const { error } = await supabase.from('reminders').delete().eq('id', id)

    if (!error) {
      setReminders((prev) => prev.filter((r) => r.id !== id))
    }
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex items-center gap-3 bg-primary-dark px-3 py-3 text-white">
        <button onClick={() => navigate('/chat')} aria-label="Back to chat">
          <BackArrowIcon className="h-5 w-5 text-white/90" />
        </button>
        <h1 className="text-lg font-semibold">Reminders</h1>
      </header>

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Loading reminders...</p>
        ) : reminders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 pt-20 text-center text-slate-500">
            <BellIcon className="h-8 w-8 text-slate-300" />
            <p className="text-sm">
              No reminders yet. Ask Campus Companion in chat to set one.
            </p>
          </div>
        ) : (
          <ul>
            {reminders.map((reminder) => (
              <li
                key={reminder.id}
                className="flex items-center gap-3 border-b border-slate-100 px-4 py-3"
              >
                <button
                  onClick={() => toggleReminder(reminder.id, reminder.completed)}
                  aria-label={reminder.completed ? 'Mark as not done' : 'Mark as done'}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
                    reminder.completed
                      ? 'border-primary bg-primary text-white'
                      : 'border-slate-300 text-transparent'
                  }`}
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                </button>

                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${reminder.completed ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                    {reminder.task}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {reminder.due_at ? new Date(reminder.due_at).toLocaleString() : 'No date set'}
                    {reminder.recurrence ? ` · ${reminder.recurrence}` : ''}
                  </p>
                </div>

                <button
                  onClick={() => deleteReminder(reminder.id)}
                  aria-label="Delete reminder"
                  className="shrink-0 p-1.5 text-slate-400 transition hover:text-red-500"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
