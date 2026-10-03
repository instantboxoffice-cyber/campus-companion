import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Invisible. While the app is open, tells the server "this phone has received
// your friends' messages", which is what turns one tick into two.
// It works on every screen, not only inside a chat.
export default function DeliveryTracker() {
  const [uid, setUid] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUid(session?.user?.id ?? null))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setUid(session?.user?.id ?? null))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!uid) return undefined

    let timer = null
    const markDelivered = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        supabase.rpc('mark_dms_delivered').then(() => {}, () => {})
      }, 200)
    }

    const channel = supabase
      .channel(`dm-delivery-${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${uid}` },
        markDelivered
      )
      // Runs on first connect and after every reconnect, so messages that
      // arrived while the phone was offline get marked as received.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') markDelivered()
      })

    const onVisible = () => {
      if (document.visibilityState === 'visible') markDelivered()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', markDelivered)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', markDelivered)
      supabase.removeChannel(channel)
    }
  }, [uid])

  return null
}
