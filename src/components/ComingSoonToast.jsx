import { useCallback, useRef, useState } from 'react'

// Usage:
//   const [toast, showToast] = useComingSoonToast()
//   <button onClick={() => showToast('Camera coming soon')}>...
//   return <div>...{toast}</div>
//
// Keeps every "not built yet" tap in the app honest and consistent -
// nothing just silently does nothing.
export function useComingSoonToast() {
  const [message, setMessage] = useState(null)
  const timeoutRef = useRef(null)

  const show = useCallback((text = 'Coming soon') => {
    setMessage(text)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setMessage(null), 1800)
  }, [])

  const toast = message ? (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4">
      <div className="rounded-full bg-slate-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
        {message}
      </div>
    </div>
  ) : null

  return [toast, show]
}