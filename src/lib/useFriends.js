import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export function useFriends() {
  const [myId, setMyId] = useState(null)
  const [lists, setLists] = useState({ friends: [], incoming: [], outgoing: [] })

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMyId(user.id)

    const { data: rows, error } = await supabase
      .from('friendships')
      .select(`id, status, requester_id, addressee_id,
        requester:profiles!requester_id(id, username, avatar_url),
        addressee:profiles!addressee_id(id, username, avatar_url)`)
    if (error) return

    // "other" is always the person who isn't me
    const mapped = rows.map((r) => ({
      id: r.id,
      status: r.status,
      iSentIt: r.requester_id === user.id,
      other: r.requester_id === user.id ? r.addressee : r.requester,
    }))

    setLists({
      friends: mapped.filter((r) => r.status === 'accepted'),
      incoming: mapped.filter((r) => r.status === 'pending' && !r.iSentIt),
      outgoing: mapped.filter((r) => r.status === 'pending' && r.iSentIt),
    })
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('friendships-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  return { myId, ...lists, reload: load }
}