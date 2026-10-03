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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [needsTap, setNeedsTap] = useState(true)
  const [silenced, setSilenced] = useState(false)

  const close = useCallback(() => {
    sounds.stopAlarm()
    if (alarm) markAcked(alarm)
    setAlarm(null)
    setBusy(false)
    setError('')
  }, [alarm])

  const snooze = useCallback(async () => {
    if (!alarm?.reminderId) return

    setBusy(true)
    setError('')

    const snoozedAt = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000).toISOString()

    if (alarm.recurring) {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (!userId) {
        setBusy(false)
        return
      }

      const { error: insertError } = await supabase.from('reminders').insert({
        user_id: userId,
        task: alarm.task,
        due_at: snoozedAt,
        recurrence: alarm.recurring,
        status: 'pending',
      })

      if (!insertError) close()
      else setError(insertError.message)
      setBusy(false)
      return
    }

    const { error: updateError } = await supabase
      .from('reminders')
      .update({ due_at: snoozedAt, status: 'pending' })
      .eq('id', alarm.reminderId)

    if (!updateError) close()
    else setError(updateError.message)
    setBusy(false)
  }, [alarm, close])

  const markDone = useCallback(async () => {
    if (!alarm?.reminderId) return

    setBusy(true)
    setError('')

    const { error: updateError } = await supabase
      .from('reminders')
      .update({ status: 'done' })
      .eq('id', alarm.reminderId)

    if (!updateError) close()
    else setError(updateError.message)
    setBusy(false)
  }, [alarm, close])

  const trigger = useCallback((nextAlarm) => {
    if (!nextAlarm?.reminderId || !nextAlarm?.dueAt) return
    if (isAcked(nextAlarm.reminderId, nextAlarm.dueAt)) return

    // Only ring while the screen is on and the app is in front.
    if (document.visibilityState === 'visible') sounds.startAlarm()
    if (navigator.vibrate) {
      navigator.vibrate([900, 180, 900, 180, 900])
    }
    setAlarm(nextAlarm)
    setNeedsTap(true)
    setError('')
  }, [])

  useEffect(() => {
    const initialAlarm = parseAlarmFromUrl()
    if (initialAlarm) {
      trigger(initialAlarm)
    }

    const handleMessage = (event) => {
      const payload = event.data
      if (!payload || payload.type !== 'REMINDER_ALARM') return

      const nextAlarm = payload.data || payload
      trigger({
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
  }, [trigger])

  useEffect(() => {
    if (!alarm) return undefined

    const handleKey = (event) => {
      if (event.key === 'Escape') {
        close()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [alarm, close])

  useEffect(() => {
    let cancelled = false

    async function pollForDueAlarm() {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user?.id || cancelled) return

      const { data, error: fetchError } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', userData.user.id)
        .lte('due_at', new Date().toISOString())
        .in('status', ['pending', 'sent'])

      if (fetchError || !data) return

      const nextDue = data.find((item) => !isAcked(item.id, item.due_at))
      if (!nextDue) return

      trigger({
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
  }, [trigger])

  useEffect(() => {
    if (!alarm) return

    const onSwMessage = (event) => {
      if (event.data?.type === 'REMINDER_ACK') {
        const reminder = event.data.reminder
        const key = reminder?.id && reminder?.due_at ? `${reminder.id}|${reminder.due_at}` : null
        if (key && alarm?.reminderId === reminder.id) {
          markAcked({ reminderId: reminder.id, dueAt: reminder.due_at })
          close()
        }
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        // keep existing wake lock logic if present
      } else {
        // Screen turned off (power button) or the app was left: go quiet.
        sounds.stopAlarm()
      }
    }

    const audioWatch = setInterval(() => {
      const ringing = sounds.alarmIsRinging()
      setSilenced(!ringing)
      setNeedsTap(ringing && !sounds.alarmIsAudible())
    }, 500)

    document.addEventListener('visibilitychange', onVisible)
    navigator.serviceWorker?.addEventListener?.('message', onSwMessage)

    return () => {
      clearInterval(audioWatch)
      setNeedsTap(false)
      setSilenced(false)
      document.removeEventListener('visibilitychange', onVisible)
      navigator.serviceWorker?.removeEventListener?.('message', onSwMessage)
    }
  }, [alarm, close])

  if (!alarm) return null

  const parsed = alarm.dueAt ? new Date(alarm.dueAt) : null
  const shown = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date()
  const timeLabel = shown.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Reminder alarm"
      className="fixed inset-0 z-[9999] flex flex-col bg-[#0B1020] px-8 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+3rem)] text-white"
    >
      <style>{`@keyframes alarm-breathe{0%,100%{transform:scale(1);opacity:.4}50%{transform:scale(1.15);opacity:0}}`}</style>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        {alarm.test && (
          <p className="mb-6 text-xs uppercase tracking-[0.3em] text-white/40">Test</p>
        )}

        <div className="relative flex h-56 w-56 items-center justify-center">
          <span
            className="absolute inset-0 rounded-full border border-white/40"
            style={{ animation: 'alarm-breathe 2.4s ease-in-out infinite' }}
          />
          <span className="text-6xl font-light tabular-nums tracking-tight">{timeLabel}</span>
        </div>

        <p className="mt-10 max-w-xs break-words text-2xl font-medium leading-snug">{alarm.task}</p>

        {silenced ? (
          <p className="mt-6 text-xs text-white/50">Silenced</p>
        ) : (
          needsTap && <p className="mt-6 text-xs text-white/50">Tap anywhere for sound</p>
        )}
        {error && <p className="mt-6 text-sm text-red-300">{error}</p>}
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-3">
        <button
          onClick={markDone}
          disabled={busy}
          className="w-full rounded-full bg-white py-4 text-lg font-semibold text-[#0B1020] transition active:scale-[0.98] disabled:opacity-50"
        >
          Done
        </button>
        <div className="flex w-full justify-between px-2">
          <button onClick={snooze} disabled={busy} className="py-3 text-base text-white/70 disabled:opacity-50">
            Snooze {SNOOZE_MINUTES} min
          </button>
          <button onClick={close} disabled={busy} className="py-3 text-base text-white/70 disabled:opacity-50">
            Stop
          </button>
        </div>
      </div>
    </div>
  )
}
