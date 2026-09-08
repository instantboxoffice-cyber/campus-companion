import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function AuthPage() {
  const [stage, setStage] = useState('email') // 'email' | 'code'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSendCode(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setStage('code')
  }

  async function handleVerifyCode(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
        <div className="bg-primary-dark px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-lg font-bold">
              C
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-sky-200">Campus Companion</p>
              <h1 className="text-xl font-semibold">Your reminder friend</h1>
            </div>
          </div>
        </div>

        <div className="p-6">
          {stage === 'email' ? (
            <form onSubmit={handleSendCode} className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-medium text-slate-500">Enter your email</p>
                <label className="block text-sm text-slate-600">Email address</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-primary px-4 py-3 font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Sending code...' : 'Send code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-5">
              <div>
                <p className="text-sm text-slate-500">We sent a 6-digit code to</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{email}</p>
              </div>

              <div>
                <label className="block text-sm text-slate-600">Verification code</label>
                <input
                  type="text"
                  placeholder="Enter the code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={8}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-lg tracking-[0.35em] outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-primary px-4 py-3 font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>

              <button
                type="button"
                onClick={() => setStage('email')}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Use a different email
              </button>
            </form>
          )}

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}