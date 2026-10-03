import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

// Sent by the chat screen after it has marked a friend's messages as read.
export const DM_READ_EVENT = 'dm-read'

export function useConversations() {
  const [conversations, setConversations] = useState([])
  // Only the newest request is allowed to update the screen. Without this, a
  // slow older answer could arrive last and bring a cleared unread badge back.
  const latestRequest = useRef(0)

  const load = useCallback(async () => {
    const request = ++latestRequest.current
    const { data: rows, error } = await supabase.rpc('get_conversations')
    if (error || request !== latestRequest.current) return

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
    if (request !== latestRequest.current) return

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

    // The chat screen says "these are read now": clear the badge straight away,
    // then confirm with the server.
    function onRead(e) {
      const friendId = e.detail?.friendId
      setConversations((prev) => prev.map((c) => (c.other_id === friendId ? { ...c, unread_count: 0 } : c)))
      load()
    }
    window.addEventListener(DM_READ_EVENT, onRead)

    return () => {
      window.removeEventListener(DM_READ_EVENT, onRead)
      supabase.removeChannel(channel)
    }
  }, [load])

  return { conversations, reload: load }
}
