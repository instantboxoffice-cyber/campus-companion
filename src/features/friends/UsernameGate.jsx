import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Pre-fills the box from the email, e.g. "ada.obi@gmail.com" -> "adaobi"
function suggestFromEmail(email) {
  const base = (email.split('@')[0] || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)
  return base.length >= 3 ? base : ''
}

export default function UsernameGate() {
  const [user, setUser] = useState(null) // set only while a username is still needed
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const clean = value.trim().toLowerCase()
  const valid = /^[a-z0-9_]{3,20}$/.test(clean)

  const check = useCallback(async (session) => {
    const authUser = session?.user
    if (!authUser) {
      setUser(null)
      return
    }

    const { data, error: readError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', authUser.id)
      .maybeSingle()
    if (readError) return // offline or a hiccup: don't block the app

    let profile = data
    if (!profile) {
      // no profile row yet (should be rare) - create it
      await supabase.from('profiles').insert({ id: authUser.id })
      profile = { username: null }
    }

    if (profile.username) {
      setUser(null)
      return
    }
    setValue((current) => current || suggestFromEmail(authUser.email ?? ''))
    setUser({ id: authUser.id })
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => check(session))

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setUser(null)
      // Not awaited inside the callback on purpose: Supabase can deadlock if you do.
      else if (event === 'SIGNED_IN') setTimeout(() => check(session), 0)
    })
    return () => listener.subscription.unsubscribe()
  }, [check])

  async function save() {
    if (!valid || saving) return
    setSaving(true)
    setError('')
    const { data, error: saveError } = await supabase
      .from('profiles')
      .update({ username: clean })
      .eq('id', user.id)
      .select('id')
    setSaving(false)

    if (saveError) {
      setError(saveError.code === '23505' ? 'That username is taken - try another' : "Couldn't save - try again")
      return
    }
    if (!data?.length) {
      setError("Couldn't save - try again")
      return
    }
    setUser(null)
  }

  if (!user) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white px-6 pt-[calc(env(safe-area-inset-top)+3rem)]">
      <h1 className="text-2xl font-bold text-slate-900">Choose your username</h1>
      <p className="mt-2 text-slate-500">
        This is how friends find you on Campus Companion. Use 3-20 letters, numbers or underscores.
      </p>

      <div className="mt-6 flex items-center rounded-lg border border-slate-200 px-3 focus-within:border-primary">
        <span className="text-slate-400">@</span>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="yourname"
          autoCapitalize="none"
          autoCorrect="off"
          className="min-w-0 flex-1 px-1 py-3 text-slate-900 focus:outline-none"
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <button
        onClick={save}
        disabled={!valid || saving}
        className="mt-6 rounded-full bg-primary py-3 font-medium text-white disabled:opacity-40"
      >
        {saving ? 'Saving...' : 'Continue'}
      </button>

      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-auto pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6 text-sm text-slate-400"
      >
        Log out
      </button>
    </div>
  )
}