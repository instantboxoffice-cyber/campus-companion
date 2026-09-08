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

  const upcoming = reminders.filter((reminder) => !reminder.completed).length
  const completed = reminders.filter((reminder) => reminder.completed).length

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-primary-dark px-4 py-4 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-200">Your list</p>
            <h1 className="text-2xl font-semibold">Reminders</h1>
          </div>

          <button onClick={() => navigate('/')} className="rounded-full border border-white/20 px-3 py-1.5 text-sm transition hover:bg-white/10">
            Back to chat
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Upcoming</p>
            <p className="mt-2 text-3xl font-bold text-primary">{upcoming}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Completed</p>
            <p className="mt-2 text-3xl font-bold text-slate-800">{completed}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Total</p>
            <p className="mt-2 text-3xl font-bold text-slate-800">{reminders.length}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loading ? (
            <p className="text-slate-500">Loading reminders...</p>
          ) : reminders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-600">
              No reminders yet. Ask Campus Companion in chat to create one.
            </div>
          ) : (
            <div className="space-y-3">
              {reminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className={`rounded-xl border p-4 ${
                    reminder.completed ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className={`font-semibold ${reminder.completed ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                        {reminder.task}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {reminder.due_at ? new Date(reminder.due_at).toLocaleString() : 'No date set'}
                      </p>
                      {reminder.recurrence && (
                        <span className="mt-2 inline-block rounded-full bg-sky-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                          {reminder.recurrence}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleReminder(reminder.id, reminder.completed)}
                        className="rounded-full bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
                      >
                        {reminder.completed ? 'Undo' : 'Done'}
                      </button>
                      <button
                        onClick={() => deleteReminder(reminder.id)}
                        className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
