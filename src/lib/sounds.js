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

let alarmInterval = null

function startAlarm() {
  const ctx = getAudioContext()
  if (!ctx) return

  stopAlarm()

  const playAlarm = () => {
    playTone({ frequency: 880, duration: 0.35, type: 'sawtooth', gain: 0.12 })
    playTone({ frequency: 660, duration: 0.35, startTime: 0.12, type: 'square', gain: 0.09 })
  }

  playAlarm()
  alarmInterval = window.setInterval(playAlarm, 700)
}

function stopAlarm() {
  if (alarmInterval) {
    window.clearInterval(alarmInterval)
    alarmInterval = null
  }
}

function alarmIsAudible() {
  return Boolean(alarmInterval)
}

function alarmIsRinging() {
  return alarmInterval !== null
}

export const sounds = {
  sent,
  received,
  startAlarm,
  stopAlarm,
  alarmIsAudible,
  alarmIsRinging,
  isMuted,
  setMuted,
  toggleMuted,
}