import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { forgetVoiceNoteUrl, getVoiceNoteUrl } from '../../lib/voice'

// Only one voice note plays at a time, like WhatsApp.
let nowPlaying = null

const BAR_COUNT = 30

function formatTime(total) {
  const t = Math.max(0, Math.round(total || 0))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

// A steady, good-looking set of bar heights for each message (same bars every time).
function barHeights(seed) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return Array.from({ length: BAR_COUNT }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
    return 22 + (h % 78) // 22% - 99% of the height
  })
}

function PlayIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  )
}

function PauseIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1.2" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" />
    </svg>
  )
}

// localUrl: the recording still on this phone (shows instantly while it uploads).
// path: where the saved voice note lives in Supabase Storage.
function VoiceNoteBubble({ localUrl, path, seconds, seed, onPrimary = true }) {
  const audioRef = useRef(null)
  const [url, setUrl] = useState(localUrl || null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)

  const bars = useMemo(() => barHeights(String(seed)), [seed])

  // Get the playable link ready BEFORE the person taps. (Phones only allow
  // sound that starts right inside a tap, so we cannot wait for a download then.)
  useEffect(() => {
    if (localUrl) {
      setUrl(localUrl)
      return undefined
    }
    if (!path) return undefined

    let cancelled = false
    getVoiceNoteUrl(path)
      .then((u) => {
        if (!cancelled) {
          setUrl(u)
          setLoadFailed(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [localUrl, path])

  // A new link means a new audio file: drop the old player.
  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        if (nowPlaying === audio) nowPlaying = null
        audioRef.current = null
      }
    }
  }, [url])

  const total = seconds || 0

  const buildAudio = useCallback(() => {
    const audio = new Audio(url)
    audio.preload = 'auto'

    const fraction = () => {
      const length = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : total
      return length > 0 ? Math.min(1, audio.currentTime / length) : 0
    }

    audio.addEventListener('timeupdate', () => {
      setProgress(fraction())
      setElapsed(audio.currentTime)
    })
    audio.addEventListener('play', () => setPlaying(true))
    audio.addEventListener('pause', () => setPlaying(false))
    audio.addEventListener('ended', () => {
      setPlaying(false)
      setProgress(0)
      setElapsed(0)
      audio.currentTime = 0
      if (nowPlaying === audio) nowPlaying = null
    })
    audio.addEventListener('error', () => {
      // Most likely an expired link - fetch a fresh one for the next tap.
      setPlaying(false)
      audioRef.current = null
      if (path && !localUrl) {
        forgetVoiceNoteUrl(path)
        getVoiceNoteUrl(path)
          .then(setUrl)
          .catch(() => setLoadFailed(true))
      }
    })
    return audio
  }, [url, total, path, localUrl])

  function toggle() {
    if (!url) return
    if (!audioRef.current) audioRef.current = buildAudio()
    const audio = audioRef.current

    if (!audio.paused) {
      audio.pause()
      return
    }

    if (nowPlaying && nowPlaying !== audio) nowPlaying.pause()
    nowPlaying = audio
    audio.play().catch(() => setPlaying(false))
  }

  // Tap on the bars to jump to that point.
  function seek(e) {
    const audio = audioRef.current
    if (!audio) return
    const length = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : total
    if (!length) return
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    audio.currentTime = fraction * length
    setProgress(fraction)
    setElapsed(audio.currentTime)
  }

  const ready = !!url
  const shownTime = playing || elapsed > 0 ? elapsed : total

  const playedColor = onPrimary ? 'bg-white' : 'bg-primary'
  const restColor = onPrimary ? 'bg-white/40' : 'bg-slate-300'

  return (
    <div className="flex w-56 max-w-full items-center gap-2.5 py-0.5 sm:w-64">
      <button
        type="button"
        onClick={toggle}
        disabled={!ready && !loadFailed}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-60 ${
          onPrimary ? 'bg-white text-primary' : 'bg-primary text-white'
        }`}
      >
        {playing ? <PauseIcon /> : <PlayIcon className="ml-0.5 h-4 w-4" />}
      </button>

      <div className="min-w-0 flex-1">
        <div
          onClick={seek}
          className="flex h-7 cursor-pointer items-center gap-[2px]"
          role="slider"
          aria-label="Voice note position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          {bars.map((height, i) => (
            <span
              key={i}
              className={`w-[3px] shrink-0 rounded-full ${i / BAR_COUNT < progress ? playedColor : restColor}`}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
        <p className={`mt-0.5 text-[11px] tabular-nums ${onPrimary ? 'text-white/80' : 'text-slate-500'}`}>
          {loadFailed && !ready ? "Couldn't load" : formatTime(shownTime)}
        </p>
      </div>
    </div>
  )
}

export default memo(VoiceNoteBubble)
