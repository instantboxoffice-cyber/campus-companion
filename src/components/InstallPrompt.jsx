import { useEffect, useState } from 'react'
import { ShareIcon, SquarePlusIcon, XIcon } from './Icons'

const DISMISS_KEY = 'cc_install_dismissed_at'
const DISMISS_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000 // don't re-nag for a week

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // iOS Safari
  )
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function recentlyDismissed() {
  const raw = localStorage.getItem(DISMISS_KEY)
  if (!raw) return false
  return Date.now() - Number(raw) < DISMISS_SNOOZE_MS
}

/**
 * A single bottom-sheet install banner that covers both install paths:
 *  - Chrome/Edge/Android: captures the native `beforeinstallprompt` event
 *    and re-triggers it from our own "Install" button (Chrome suppresses
 *    its default mini-infobar once we've called preventDefault()).
 *  - iOS Safari: there's no install event to hook into, so instead we show
 *    the manual "Share -> Add to Home Screen" steps.
 * Both variants share the same WhatsApp-style card so the app doesn't ask
 * twice, in two different visual languages, in the same session.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [visible, setVisible] = useState(false)
  const [entered, setEntered] = useState(false)
  const [variant, setVariant] = useState('android') // 'android' | 'ios'

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return

    if (isIOS()) {
      // No native signal on iOS - just wait a beat so it doesn't slam the
      // user with a prompt before they've seen the app at all.
      const timer = setTimeout(() => {
        setVariant('ios')
        setVisible(true)
      }, 2500)
      return () => clearTimeout(timer)
    }

    function handleBeforeInstallPrompt(event) {
      event.preventDefault()
      setDeferredPrompt(event)
      setVariant('android')
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    function handleInstalled() {
      dismiss(false)
    }
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    // Mount off-screen, then animate in on the next frame.
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [visible])

  function dismiss(remember = true) {
    setEntered(false)
    if (remember) localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setTimeout(() => setVisible(false), 220)
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    dismiss(outcome !== 'accepted')
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div
        role="dialog"
        aria-label="Install Campus Companion"
        className={`w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-black/5 transition-all duration-200 ease-out ${
          entered ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        <div className="flex items-start gap-3">
          <img
            src="/icon-192.png"
            alt=""
            className="h-12 w-12 shrink-0 rounded-[14px] shadow-sm"
          />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm font-semibold text-slate-900">Install Campus Companion</p>
            <p className="mt-0.5 text-xs leading-snug text-slate-500">
              {variant === 'ios'
                ? 'Add it to your Home Screen for the full app experience and reminder alerts.'
                : 'Add it to your home screen for quick access and reminder alerts.'}
            </p>
          </div>
          <button
            onClick={() => dismiss(true)}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {variant === 'ios' ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1">
              Tap <ShareIcon className="h-4 w-4 text-primary" />
            </span>
            <span>then</span>
            <span className="inline-flex items-center gap-1 font-medium text-slate-800">
              <SquarePlusIcon className="h-4 w-4 text-primary" /> Add to Home Screen
            </span>
          </div>
        ) : (
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => dismiss(true)}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100"
            >
              Not now
            </button>
            <button
              onClick={handleInstallClick}
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition active:scale-95"
            >
              Install
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
