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
        shouldCreateUser: true, // allow new users to sign up this way too
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

    // Success — Supabase session is now stored.
    // ProtectedRoute will pick this up and redirect to the chat page.
  }

  if (stage === 'email') {
    return (
      <div>
        <h1>Campus Companion</h1>
        <form onSubmit={handleSendCode}>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send code'}
          </button>
        </form>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <h1>Enter your code</h1>
      <p>We sent a 8-digit code to {email}</p>
      <form onSubmit={handleVerifyCode}>
        <input
          type="text"
          placeholder="Enter the code from your email"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={8}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Verifying...' : 'Verify'}
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button onClick={() => setStage('email')}>Use a different email</button>
    </div>
  )
}