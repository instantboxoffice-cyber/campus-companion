import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function ProtectedRoute({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still checking

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Never gate the render on this check with a loading screen - that's
  // exactly the flash that used to show up on every navigation, since
  // React remounts a fresh ProtectedRoute (and re-runs this check) on
  // every route change. Instead: render the page immediately, the same
  // way WhatsApp just opens. `session` starts as `undefined` ("still
  // checking, assume it's fine") and only becomes `null` once we know
  // for certain there's no session - that's the one case we redirect on.
  if (session === null) {
    return <Navigate to="/auth" replace />
  }

  return children
}