import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import Avatar from '../../components/Avatar'
import { PencilIcon } from '../../components/Icons'
import LoadingSpinner from '../../components/LoadingSpinner'

// Supabase's email OTP length is a project-level setting (Dashboard ->
// Authentication -> Emails), not something the client can read at runtime.
// It can be anywhere from 6-10 digits depending on how/when the project was
// provisioned. Set this to whatever your project is actually sending -
// check the code in the confirmation email if you're not sure - and the
// input below will always match it. Nothing else in this file assumes 6.
const OTP_LENGTH = 6

const RESEND_COOLDOWN_SECONDS = 30

export default function AuthPage() {
  const navigate = useNavigate()
  const [stage, setStage] = useState('email') // 'email' | 'code'
  const [email, setEmail] = useState('')
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const inputRefs = useRef([])

  // If someone who is already signed in lands on /auth (e.g. a stale tab,
  // or a bookmark), send them straight into the app instead of showing the
  // sign-in form again.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/', { replace: true })
    })
  }, [navigate])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function sendCode() {
    setError('')
    setLoading(true)

    const { error: sendError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })

    setLoading(false)

    if (sendError) {
      setError(sendError.message)
      return false
    }

    setCooldown(RESEND_COOLDOWN_SECONDS)
    return true
  }

  async function handleSendCode(e) {
    e.preventDefault()
    const ok = await sendCode()
    if (ok) {
      setDigits(Array(OTP_LENGTH).fill(''))
      setStage('code')
      setTimeout(() => inputRefs.current[0]?.focus(), 0)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || loading) return
    await sendCode()
  }

  function handleDigitChange(index, rawValue) {
    const value = rawValue.replace(/\D/g, '')

    // Handles pasting the full code into any box, not just the first one.
    if (value.length > 1) {
      const pasted = value.slice(0, OTP_LENGTH).split('')
      const next = Array(OTP_LENGTH).fill('')
      pasted.forEach((d, i) => { next[i] = d })
      setDigits(next)
      const lastFilled = Math.min(pasted.length, OTP_LENGTH) - 1
      inputRefs.current[Math.max(lastFilled, 0)]?.focus()
      if (pasted.length >= OTP_LENGTH) verifyCode(next.join(''))
      return
    }

    const next = [...digits]
    next[index] = value
    setDigits(next)

    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }

    if (value && next.every((d) => d !== '')) {
      verifyCode(next.join(''))
    }
  }

  function handleDigitKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  async function verifyCode(code) {
    setError('')
    setLoading(true)

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    })

    setLoading(false)

    if (verifyError) {
      setError(verifyError.message)
      return
    }

    // This is the fix for "signup just stays on the signup page": a
    // successful verifyOtp() updates the Supabase session, but nothing
    // was ever telling the router to leave /auth. ProtectedRoute only
    // guards routes that require a session - it doesn't watch /auth
    // itself - so without this explicit navigate() the form just sat
    // there, verified, going nowhere.
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-primary-dark text-white">
      {stage === 'email' ? (
        <form
          onSubmit={handleSendCode}
          className="flex flex-1 flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] pt-[calc(env(safe-area-inset-top)+4rem)]"
        >
          <Avatar label="campus-companion" size="lg" className="mx-auto" />

          <h1 className="mt-8 text-center text-2xl font-semibold">Campus Companion</h1>
          <p className="mx-auto mt-2 max-w-xs text-center text-sm text-sky-200/80">
            Enter your email address. We'll send you a code to confirm it's you.
          </p>

          <div className="mt-10">
            <label className="text-xs uppercase tracking-[0.2em] text-sky-200/70">Email address</label>
            <input
              type="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-2 w-full border-b border-white/25 bg-transparent pb-2 text-lg text-white outline-none transition placeholder:text-white/30 focus:border-accent"
            />
          </div>

          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

          <div className="mt-auto flex justify-end pt-10">
            <button
              type="submit"
              disabled={loading || !email}
              aria-label="Send code"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-primary-dark shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary-dark/40 border-t-primary-dark" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-1 flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] pt-[calc(env(safe-area-inset-top)+4rem)]">
          <h1 className="text-center text-2xl font-semibold">Verify your email</h1>

          <button
            type="button"
            onClick={() => setStage('email')}
            className="mx-auto mt-3 flex items-center gap-1.5 text-sm text-sky-200/80"
          >
            <span>{email}</span>
            <PencilIcon className="h-3.5 w-3.5" />
          </button>

          <p className="mx-auto mt-4 max-w-xs text-center text-sm text-sky-200/70">
            Enter the {OTP_LENGTH}-digit code we just emailed you.
          </p>

          <div className="mx-auto mt-10 flex w-full max-w-xs justify-center gap-2">
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => (inputRefs.current[i] = el)}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_LENGTH}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleDigitKeyDown(i, e)}
                className="h-14 w-full min-w-0 max-w-11 flex-1 rounded-lg border border-white/25 bg-white/5 text-center text-xl font-semibold text-white outline-none transition focus:border-accent focus:bg-white/10"
              />
            ))}
          </div>

          {error && <p className="mx-auto mt-5 max-w-xs text-center text-sm text-red-300">{error}</p>}

          {loading && (
            <div className="mt-5 flex justify-center text-sky-200/70">
              <LoadingSpinner label="Verifying code" />
            </div>
          )}

          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0}
            className="mt-8 text-center text-sm font-medium text-accent disabled:text-white/30"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
        </div>
      )}
    </div>
  )
}
