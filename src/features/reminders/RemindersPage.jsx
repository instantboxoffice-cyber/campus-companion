import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

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
    <div className="min-h-screen bg-white text-slate-900">
      <header className="bg-primary-dark text-white p-4 flex justify-between items-center">
        <div>
          <h1 className="font-bold">Reminders</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-sm underline">Chat</button>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {loading ? (
          <p>Loading reminders...</p>
        ) : reminders.length === 0 ? (
          <div className="rounded-lg border border-slate-200 p-4 text-slate-600">
            No reminders yet. Ask the companion to create one in chat.
          </div>
        ) : (
          reminders.map((reminder) => (
            <div
              key={reminder.id}
              className={`rounded-lg border p-4 ${
                reminder.completed ? 'bg-slate-100 border-slate-200' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`font-medium ${reminder.completed ? 'line-through text-slate-500' : ''}`}>
                    {reminder.task}
                  </p>
                  <p className="text-sm text-slate-500">
                    {reminder.due_at ? new Date(reminder.due_at).toLocaleString() : 'No date set'}
                  </p>
                  {reminder.recurrence && (
                    <p className="text-xs uppercase tracking-wide text-primary mt-1">
                      {reminder.recurrence}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => toggleReminder(reminder.id, reminder.completed)}
                    className="text-sm px-2 py-1 rounded bg-primary text-white"
                  >
                    {reminder.completed ? 'Undo' : 'Done'}
                  </button>
                  <button
                    onClick={() => deleteReminder(reminder.id)}
                    className="text-sm px-2 py-1 rounded border border-slate-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  )
}
