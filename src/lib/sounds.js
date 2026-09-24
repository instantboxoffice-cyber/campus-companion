const MUTE_KEY = 'companion_sounds_muted'

let audioCtx = null

// Lazily creates (and resumes) a single shared AudioContext. Browsers
// suspend a freshly-created context until a user gesture has happened on
// the page, so every call here also nudges it awake - by the time any
// sound fires we've always had at least one user interaction (a click),
// so resume() just works.
function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    audioCtx = new AudioContextClass()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

function isMuted() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(MUTE_KEY) === '1'
}

function setMuted(muted) {
  if (typeof window === 'undefined') return
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
}

function toggleMuted() {
  const next = !isMuted()
  setMuted(next)
  return next
}

// Plays one short synthesized tone. No audio files to load or license -
// just an oscillator with a quick fade in/out so it doesn't click/pop.
function playTone({ frequency, duration, startTime = 0, type = 'sine', gain = 0.15 }) {
  const ctx = getAudioContext()
  if (!ctx) return

  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + startTime)

  gainNode.gain.setValueAtTime(0, ctx.currentTime + startTime)
  gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + startTime + 0.008)
  gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + startTime + duration)

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.start(ctx.currentTime + startTime)
  oscillator.stop(ctx.currentTime + startTime + duration + 0.02)
}

function sent() {
  if (isMuted()) return
  // Quick two-note "pop" - snappy and short, sits above click() in volume
  // so a sent message still reads as its own distinct event.
  playTone({ frequency: 660, duration: 0.05, startTime: 0, type: 'sine', gain: 0.11 })
  playTone({ frequency: 880, duration: 0.06, startTime: 0.04, type: 'sine', gain: 0.11 })
}

function received() {
  if (isMuted()) return
  // Three ascending notes (C5-E5-G5) - a small, satisfying "ta-da" chime
  // for an incoming message, rather than a flat single beep.
  playTone({ frequency: 523.25, duration: 0.09, startTime: 0, type: 'sine', gain: 0.13 })
  playTone({ frequency: 659.25, duration: 0.09, startTime: 0.07, type: 'sine', gain: 0.13 })
  playTone({ frequency: 783.99, duration: 0.14, startTime: 0.14, type: 'sine', gain: 0.13 })
}

let lastClickAt = 0

function click() {
  if (isMuted()) return
  // Throttled so a fast run of clicks (or a stray double-fire) can't pile
  // sounds on top of each other and turn into noise.
  const now = performance.now()
  if (now - lastClickAt < 45) return
  lastClickAt = now
  // Very short, quiet, high "tick" - meant to sit in the background, not
  // compete with sent()/received() for attention.
  playTone({ frequency: 1000, duration: 0.035, type: 'sine', gain: 0.06 })
}

function isInteractiveTarget(el) {
  if (!el || typeof el.closest !== 'function') return null
  return el.closest(
    'button, [role="button"], a[href], input[type="submit"], input[type="button"]'
  )
}

let globalClickListenerAttached = false

// Call this ONCE at app startup (see wiring note). Delegates from
// document root rather than wiring onClick on every button individually -
// any button anywhere in the app, present or future, gets the click sound
// automatically. Opt an individual element out with data-no-click-sound.
function attachGlobalClickSound() {
  if (typeof document === 'undefined') return
  if (globalClickListenerAttached) return
  globalClickListenerAttached = true

  document.addEventListener(
    'click',
    (e) => {
      const target = isInteractiveTarget(e.target)
      if (!target) return
      if (target.disabled) return
      if (target.dataset.noClickSound !== undefined) return
      click()
    },
    { capture: true }
  )
}

export const sounds = {
  sent,
  received,
  click,
  isMuted,
  setMuted,
  toggleMuted,
  attachGlobalClickSound,
}