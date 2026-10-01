import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export function useUserCount() {
  const [count, setCount] = useState(null) // null = not known yet, show nothing

  useEffect(() => {
    let active = true

    async function load() {
      const { data, error } = await supabase.rpc('get_user_count')
      if (active && !error) setCount(Number(data))
    }

    load()

    const channel = supabase
      .channel('profiles-count')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' },
        () => setCount((c) => (c === null ? c : c + 1)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles' },
        () => setCount((c) => (c === null ? c : Math.max(0, c - 1))))
      // Re-syncs after any reconnect, so the number can't drift
      .subscribe((status) => { if (status === 'SUBSCRIBED') load() })

    window.addEventListener('online', load)
    return () => {
      active = false
      window.removeEventListener('online', load)
      supabase.removeChannel(channel)
    }
  }, [])

  return count
}