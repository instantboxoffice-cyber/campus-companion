import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export function useConversations() {
  const [conversations, setConversations] = useState([])

  const load = useCallback(async () => {
    const { data: rows, error } = await supabase.rpc('get_conversations')
    if (error) return

    const { data: { session } } = await supabase.auth.getSession()
    const myId = session?.user?.id

    const ids = rows.map((r) => r.other_id)
    let byId = {}
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', ids)
      byId = Object.fromEntries((profs ?? []).map((p) => [p.id, p]))
    }

    setConversations(
      rows.map((r) => ({
        ...r,
        unread_count: Number(r.unread_count),
        lastFromMe: r.last_sender_id === myId,
        username: byId[r.other_id]?.username ?? null,
        avatar_url: byId[r.other_id]?.avatar_url ?? null,
      }))
    )
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('dm-conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  return { conversations, reload: load }
}