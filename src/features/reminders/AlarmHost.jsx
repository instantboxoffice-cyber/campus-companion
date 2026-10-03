import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { sounds } from '../../lib/sounds'

const ACK_KEY = 'companion_alarm_acked'
const SNOOZE_MINUTES = 10

function parseAlarmFromUrl() {
  if (typeof window === 'undefined') return null

  const raw = new URLSearchParams(window.location.search).get('alarm')
  if (!raw) return null

  try {
    const data = JSON.parse(decodeURIComponent(raw))
    if (!data || !data.reminderId) return null
    return data
  } catch {
    return null
  }
}

function loadAcked() {
  if (typeof window === 'undefined') return []

  try {
    const raw = localStorage.getItem(ACK_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function isAcked(reminderId, dueAt) {
  if (!reminderId || !dueAt) return false

  const acks = loadAcked()
  return acks.some((item) => item.id === reminderId && item.dueAt === dueAt)
}

function markAcked(reminder) {
  if (!reminder?.reminderId || !reminder?.dueAt || typeof window === 'undefined') return

  const acks = loadAcked()
  const next = [...acks.filter((item) => !(item.id === reminder.reminderId && item.dueAt === reminder.dueAt)), {
    id: reminder.reminderId,
    dueAt: reminder.dueAt,
  }]

  localStorage.setItem(ACK_KEY, JSON.stringify(next))
}

export default function AlarmHost() {
  const [alarm, setAlarm] = useState(null)

  const stopAlarm = useCallback(() => {
    sounds.stopAlarm()
    if (alarm) markAcked(alarm)
    setAlarm(null)
  }, [alarm])

  const triggerAlarm = useCallback((nextAlarm) => {
    if (!nextAlarm?.reminderId || !nextAlarm?.dueAt) return
    if (isAcked(nextAlarm.reminderId, nextAlarm.dueAt)) return

    sounds.startAlarm()
    if (navigator.vibrate) {
      navigator.vibrate([900, 180, 900, 180, 900])
    }
    setAlarm(nextAlarm)
  }, [])

  useEffect(() => {
    const initialAlarm = parseAlarmFromUrl()
    if (initialAlarm) {
      triggerAlarm(initialAlarm)
    }

    const handleMessage = (event) => {
      const payload = event.data
      if (!payload || payload.type !== 'REMINDER_ALARM') return

      const nextAlarm = payload.data || payload
      triggerAlarm({
        reminderId: nextAlarm.reminderId ?? nextAlarm.id,
        task: nextAlarm.task ?? 'Reminder',
        dueAt: nextAlarm.dueAt ?? nextAlarm.due_at ?? new Date().toISOString(),
        recurring: nextAlarm.recurring ?? null,
      })
    }

    navigator.serviceWorker?.addEventListener?.('message', handleMessage)

    return () => {
      navigator.serviceWorker?.removeEventListener?.('message', handleMessage)
    }
  }, [triggerAlarm])

  useEffect(() => {
    if (!alarm) return undefined

    const handleKey = (event) => {
      if (event.key === 'Escape') {
        stopAlarm()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [alarm, stopAlarm])

  useEffect(() => {
    let cancelled = false

    async function pollForDueAlarm() {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user?.id || cancelled) return

      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', userData.user.id)
        .lte('due_at', new Date().toISOString())
        .in('status', ['pending', 'sent'])

      if (error || !data) return

      const nextDue = data.find((item) => !isAcked(item.id, item.due_at))
      if (!nextDue) return

      triggerAlarm({
        reminderId: nextDue.id,
        task: nextDue.task,
        dueAt: nextDue.due_at,
        recurring: nextDue.recurrence ?? null,
      })
    }

    pollForDueAlarm()
    const timer = window.setInterval(pollForDueAlarm, 30000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [triggerAlarm])

  async function handleDone() {
    if (!alarm?.reminderId) return

    const { error } = await supabase
      .from('reminders')
      .update({ status: 'done' })
      .eq('id', alarm.reminderId)

    if (!error) {
      stopAlarm()
    }
  }

  async function handleSnooze() {
    if (!alarm?.reminderId) return

    const snoozedAt = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000).toISOString()

    if (alarm.recurring) {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (!userId) return

      const { error } = await supabase.from('reminders').insert({
        user_id: userId,
        task: alarm.task,
        due_at: snoozedAt,
        recurrence: alarm.recurring,
        status: 'pending',
      })

      if (!error) stopAlarm()
      return
    }

    const { error } = await supabase
      .from('reminders')
      .update({ due_at: snoozedAt, status: 'pending' })
      .eq('id', alarm.reminderId)

    if (!error) stopAlarm()
  }

  if (!alarm) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">Reminder</p>
        <h2 className="mt-3 text-3xl font-bold leading-tight">{alarm.task}</h2>
        <p className="mt-2 text-sm text-slate-300">
          {new Date(alarm.dueAt).toLocaleString()}
        </p>

        <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-center text-sm text-amber-100">
          Tap anywhere to turn the sound on.
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleDone}
            className="rounded-xl bg-emerald-500 px-3 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
          >
            Done
          </button>
          <button
            type="button"
            onClick={handleSnooze}
            className="rounded-xl bg-amber-500 px-3 py-3 text-sm font-semibold text-white transition hover:bg-amber-400"
          >
            Snooze 10 min
          </button>
          <button
            type="button"
            onClick={stopAlarm}
            className="rounded-xl bg-slate-700 px-3 py-3 text-sm font-semibold text-white transition hover:bg-slate-600"
          >
            Stop alarm
          </button>
        </div>

        <button
          type="button"
          onClick={() => sounds.startAlarm()}
          className="mt-6 flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/10"
        >
          Turn sound on
        </button>
      </div>
    </div>
  )
}
