import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Avatar from '../../components/Avatar'

const BATCH = 12 // reels fetched at a time; more are fetched as you near the end

// ---------- YouTube player loader (loads the official script once) ----------
let ytPromise = null
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (ytPromise) return ytPromise
  ytPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return ytPromise
}

// ---------- network check ----------
// Phones can tell us if the user turned on Data Saver or has a slow connection.
function getNetwork() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : undefined
  const type = c?.effectiveType ?? ''
  return {
    saveData: c?.saveData === true,
    slow: c?.saveData === true || type === 'slow-2g' || type === '2g' || type === '3g',
  }
}

// ---------- small helpers ----------
function formatCount(value) {
  const n = Number(value) || 0
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

function timeAgo(iso) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

// ---------- icons ----------
const HeartIcon = ({ filled }) => (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill={filled ? '#ff3b5c' : 'none'} stroke={filled ? '#ff3b5c' : 'currentColor'} strokeWidth="1.8" strokeLinejoin="round">
    <path d="M12 21s-7.5-4.6-9.6-9.1C1 8.7 2.8 5 6.4 5c2 0 3.7 1.1 5.6 3.2C13.9 6.1 15.6 5 17.6 5c3.6 0 5.4 3.7 4 6.9C19.5 16.4 12 21 12 21z" />
  </svg>
)
const CommentIcon = () => (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="M21 11.5a8.5 8.5 0 01-12.2 7.6L3 21l1.9-5.6A8.5 8.5 0 1121 11.5z" />
  </svg>
)
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
    <path d="M22 3L10 14M22 3l-7 18-5-7-7-5 19-6z" />
  </svg>
)
const SoundIcon = ({ on }) => (
  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    {on ? <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}
  </svg>
)
const RefreshIcon = ({ spinning }) => (
  <svg viewBox="0 0 24 24" className={`h-6 w-6 ${spinning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5" />
  </svg>
)
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" className="h-16 w-16" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
)

// ---------- one full-screen reel ----------
function Reel({ video, index, isActive, shouldMount, soundOn, onToggleSound, onLike, onOpenComments, onPlaying, blocked, onBlocked, onUnblock }) {
  const hostRef = useRef(null)
  const playerRef = useRef(null)
  const readyRef = useRef(false)
  const activeRef = useRef(isActive)
  const soundRef = useRef(soundOn)
  const needsRestartRef = useRef(false)
  const onPlayingRef = useRef(onPlaying)
  const onBlockedRef = useRef(onBlocked)
  const blockTimerRef = useRef(null)
  const hasPlayedRef = useRef(false)
  const lastTap = useRef(0)
  const tapTimer = useRef(null)
  const [paused, setPaused] = useState(false)
  const [buffering, setBuffering] = useState(true)
  const [hearts, setHearts] = useState(0)

  // Make the real player match what the screen should be doing right now.
  // Only the reel on screen may play. The others are only loaded and kept paused.
  const sync = useCallback(() => {
    const p = playerRef.current
    if (!p || !readyRef.current) return
    try {
      if (soundRef.current) p.unMute()
      else p.mute()
      if (activeRef.current) {
        if (needsRestartRef.current) {
          p.seekTo(0, true)
          needsRestartRef.current = false
        }
        p.playVideo()
        clearTimeout(blockTimerRef.current)
        if (soundRef.current) {
          blockTimerRef.current = setTimeout(() => {
            try {
              const state = p.getPlayerState()
              if (activeRef.current && soundRef.current && (state === -1 || state === 5)) onBlockedRef.current?.()
            } catch {
              /* ignore */
            }
          }, 2500)
        }
      } else {
        clearTimeout(blockTimerRef.current)
        p.pauseVideo()
      }
    } catch {
      /* player not ready yet */
    }
  }, [])

  useEffect(() => {
    activeRef.current = isActive
    soundRef.current = soundOn
    onPlayingRef.current = onPlaying
    onBlockedRef.current = onBlocked
    if (isActive) {
      setPaused(false)
      hasPlayedRef.current = true
    } else if (hasPlayedRef.current) {
      // When you swipe back to a reel you already watched, start it from the beginning.
      needsRestartRef.current = true
    }
    sync()
  }, [isActive, soundOn, sync, onPlaying, onBlocked])

  // Create the player early (for the next few reels) so they are ready before you swipe.
  useEffect(() => {
    if (!shouldMount) return undefined
    const host = hostRef.current
    let cancelled = false

    loadYouTubeApi().then((YT) => {
      if (cancelled || !host) return
      const target = document.createElement('div')
      host.replaceChildren(target)
      playerRef.current = new YT.Player(target, {
        videoId: video.video_id,
        playerVars: {
          autoplay: 0,
          controls: 0,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          fs: 0,
          disablekb: 1,
          iv_load_policy: 3,
          loop: 1,
          playlist: video.video_id,
        },
        events: {
          onAutoplayBlocked: () => {
            if (activeRef.current) onBlockedRef.current?.()
          },
          onReady: (e) => {
            readyRef.current = true
            // Ask YouTube for a smaller picture to save data (YouTube may ignore this).
            try {
              e.target.setPlaybackQuality(getNetwork().slow ? 'small' : 'medium')
            } catch {
              /* ignore */
            }
            sync()
          },
          onStateChange: (e) => {
            // 1 = playing. If a reel that is NOT on screen starts playing, stop it right away.
            if (e.data === 1 && !activeRef.current) {
              e.target.pauseVideo()
              return
            }
            if (e.data === 1) {
              setBuffering(false)
              onPlayingRef.current?.()
            } else if (e.data === 3) {
              setBuffering(true)
            }
            // 0 = ended: start again so it loops
            if (e.data === 0 && activeRef.current) {
              e.target.seekTo(0)
              e.target.playVideo()
            }
          },
        },
      })
    })

    return () => {
      cancelled = true
      readyRef.current = false
      clearTimeout(blockTimerRef.current)
      try {
        playerRef.current?.destroy()
      } catch {
        /* already gone */
      }
      playerRef.current = null
      host?.replaceChildren()
    }
  }, [shouldMount, video.video_id, sync])

  // One tap = pause/play. Double tap = like.
  function handleTap() {
    if (blocked) {
      onUnblock()
      return
    }
    const now = Date.now()
    if (now - lastTap.current < 300) {
      clearTimeout(tapTimer.current)
      lastTap.current = 0
      setHearts((h) => h + 1)
      if (!video.liked_by_me) onLike(video.video_id)
      return
    }
    lastTap.current = now
    tapTimer.current = setTimeout(() => {
      const p = playerRef.current
      if (!p || !readyRef.current) return
      try {
        if (p.getPlayerState() === 1) {
          p.pauseVideo()
          setPaused(true)
        } else {
          p.playVideo()
          setPaused(false)
        }
      } catch {
        /* ignore */
      }
    }, 300)
  }

  async function share() {
    const url = `https://www.youtube.com/shorts/${video.video_id}`
    try {
      if (navigator.share) await navigator.share({ title: video.title, url })
      else await navigator.clipboard.writeText(url)
    } catch {
      /* user cancelled */
    }
  }

  const actionBtn = 'pointer-events-auto flex flex-col items-center gap-1 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]'

  return (
    <section data-index={index} className="relative h-full snap-start snap-always overflow-hidden bg-black">
      {/* Video layer: the player is bigger than the screen when needed, so it always fills it. */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ containerType: 'size', backgroundImage: video.thumbnail_url ? `url(${video.thumbnail_url})` : undefined }}
      >
        <div
          ref={hostRef}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 [&_iframe]:pointer-events-none [&_iframe]:h-full [&_iframe]:w-full"
          style={{ width: 'max(100cqw, calc(100cqh * 9 / 16))', height: 'max(100cqh, calc(100cqw * 16 / 9))' }}
        />
      </div>

      {/* Invisible layer on top that catches taps and swipes (the video itself never gets touched). */}
      <div onClick={handleTap} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 to-transparent" />

      {isActive && buffering && !paused && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        </div>
      )}

      {paused && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/80">
          <PauseIcon />
        </div>
      )}

      {blocked && isActive && (
        <button
          onClick={onUnblock}
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-white"
        >
          Tap for sound
        </button>
      )}

      {hearts > 0 && (
        <div
          key={hearts}
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ animation: 'reel-pop 0.8s ease-out forwards' }}
        >
          <svg viewBox="0 0 24 24" className="h-28 w-28" fill="#ff3b5c">
            <path d="M12 21s-7.5-4.6-9.6-9.1C1 8.7 2.8 5 6.4 5c2 0 3.7 1.1 5.6 3.2C13.9 6.1 15.6 5 17.6 5c3.6 0 5.4 3.7 4 6.9C19.5 16.4 12 21 12 21z" />
          </svg>
        </div>
      )}

      {/* Right side buttons */}
      <div className="pointer-events-none absolute bottom-6 right-3 z-10 flex flex-col items-center gap-5">
        <button onClick={() => onLike(video.video_id)} className={actionBtn} aria-label="Like">
          <HeartIcon filled={video.liked_by_me} />
          <span className="text-xs font-medium">{formatCount(video.like_count)}</span>
        </button>
        <button onClick={() => onOpenComments(video)} className={actionBtn} aria-label="Comments">
          <CommentIcon />
          <span className="text-xs font-medium">{formatCount(video.comment_count)}</span>
        </button>
        <button onClick={share} className={actionBtn} aria-label="Share">
          <ShareIcon />
          <span className="text-xs font-medium">Share</span>
        </button>
        <button onClick={onToggleSound} className={actionBtn} aria-label={soundOn ? 'Mute' : 'Unmute'}>
          <SoundIcon on={soundOn} />
        </button>
      </div>

      {/* Bottom left text */}
      <div className="pointer-events-none absolute bottom-5 left-4 right-20 z-10 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
        <p className="truncate text-sm font-semibold">{video.channel_title}</p>
        <p className="mt-1 line-clamp-2 text-sm">{video.title}</p>
        <p className="mt-1 text-xs text-white/70">{formatCount(video.views)} views</p>
      </div>
    </section>
  )
}

// ---------- comments sheet ----------
function CommentsSheet({ video, uid, onClose, onCountChange }) {
  const [tab, setTab] = useState('youtube') // 'youtube' (read only) or 'campus'
  const [comments, setComments] = useState(null)
  const [ytComments, setYtComments] = useState(null)
  const [ytNote, setYtNote] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const columns = 'id, body, created_at, user_id, profiles(username, avatar_url)'

  useEffect(() => {
    let cancelled = false
    supabase
      .from('reel_comments')
      .select(columns)
      .eq('video_id', video.video_id)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) setError("Couldn't load comments.")
        setComments(data ?? [])
      })

    supabase.functions
      .invoke('youtube-comments', { body: { video_id: video.video_id } })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err || !data) {
          setYtComments([])
          setYtNote("Couldn't load YouTube comments.")
          return
        }
        setYtComments(data.comments ?? [])
        if (data.disabled) setYtNote('Comments are turned off on YouTube for this video.')
        else if (data.unavailable && !(data.comments ?? []).length) setYtNote('YouTube comments are not available right now.')
      })

    return () => {
      cancelled = true
    }
  }, [video.video_id])

  async function send() {
    const body = text.trim()
    if (!body || sending || !uid) return
    setSending(true)
    setError('')
    const { data, error: err } = await supabase
      .from('reel_comments')
      .insert({ video_id: video.video_id, user_id: uid, body })
      .select(columns)
      .single()
    setSending(false)
    if (err) {
      setError("Couldn't post your comment. Try again.")
      return
    }
    setComments((list) => [data, ...(list ?? [])])
    setText('')
    onCountChange(video.video_id, 1)
  }

  async function remove(id) {
    const { error: err } = await supabase.from('reel_comments').delete().eq('id', id)
    if (err) return
    setComments((list) => list.filter((c) => c.id !== id))
    onCountChange(video.video_id, -1)
  }

  const tabClass = (name) =>
    `flex-1 py-2 text-sm font-medium ${tab === name ? 'border-b-2 border-primary text-white' : 'text-white/50'}`

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-[75%] flex-col rounded-t-2xl bg-primary-dark text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <p className="text-sm font-semibold">Comments</p>
          <button onClick={onClose} className="px-2 text-xl leading-none text-white/70" aria-label="Close">
            ×
          </button>
        </div>

        <div className="flex border-b border-white/10">
          <button onClick={() => setTab('youtube')} className={tabClass('youtube')}>
            YouTube
          </button>
          <button onClick={() => setTab('campus')} className={tabClass('campus')}>
            Campus Companion{comments ? ` (${comments.length})` : ''}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {tab === 'youtube' && (
            <>
              {ytComments === null && <p className="text-center text-sm text-white/50">Loading…</p>}
              {ytComments?.length === 0 && (
                <p className="mt-8 text-center text-sm text-white/50">{ytNote || 'No comments on YouTube yet.'}</p>
              )}
              {ytComments?.map((c) => (
                <div key={c.id} className="mb-4 flex gap-3">
                  <Avatar size="sm" src={c.avatar} label={(c.author ?? 'Y').replace('@', '').charAt(0).toUpperCase()} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white/60">
                      {c.author}
                      {c.published_at ? ` · ${timeAgo(c.published_at)}` : ''}
                    </p>
                    <p className="whitespace-pre-line break-words text-sm">{c.text}</p>
                    {c.likes > 0 && <p className="mt-0.5 text-xs text-white/50">♥ {formatCount(c.likes)}</p>}
                  </div>
                </div>
              ))}
              {ytComments?.length > 0 && (
                <p className="pb-2 text-center text-xs text-white/40">
                  YouTube comments are read only. Use the Campus Companion tab to comment.
                </p>
              )}
            </>
          )}

          {tab === 'campus' && (
            <>
              {comments === null && <p className="text-center text-sm text-white/50">Loading…</p>}
              {comments?.length === 0 && (
                <p className="mt-8 text-center text-sm text-white/50">No comments yet. Be the first.</p>
              )}
              {comments?.map((c) => (
                <div key={c.id} className="mb-4 flex gap-3">
                  <Avatar
                    size="sm"
                    src={c.profiles?.avatar_url}
                    label={(c.profiles?.username ?? 'S').charAt(0).toUpperCase()}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white/60">
                      {c.profiles?.username ?? 'student'} · {timeAgo(c.created_at)}
                    </p>
                    <p className="break-words text-sm">{c.body}</p>
                  </div>
                  {c.user_id === uid && (
                    <button onClick={() => remove(c.id)} className="self-start text-xs text-white/40">
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {error && tab === 'campus' && <p className="px-4 pb-1 text-xs text-red-400">{error}</p>}
        {tab === 'campus' && (
          <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              maxLength={500}
              placeholder="Add a comment…"
              className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2 text-white outline-none placeholder:text-white/40"
            />
            <button
              onClick={send}
              disabled={!text.trim() || sending}
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Post
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- the feed ----------
export default function ReelsFeed() {
  const [items, setItems] = useState(null) // null = loading
  const [failed, setFailed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem('reels_sound') !== 'off'
    } catch {
      return true
    }
  })
  const [blocked, setBlocked] = useState(false)
  const [commentFor, setCommentFor] = useState(null)
  const [uid, setUid] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [settledIndex, setSettledIndex] = useState(0)
  const [startedKey, setStartedKey] = useState(null)
  const [network] = useState(getNetwork)

  const containerRef = useRef(null)
  const itemsRef = useRef([])
  const keyRef = useRef(0)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    itemsRef.current = items ?? []
  }, [items])

  const fetchBatch = useCallback(async (exclude) => {
    const { data, error } = await supabase.rpc('get_reels', { p_limit: BATCH, p_exclude: exclude })
    if (error) throw error
    return (data ?? []).map((v) => ({ ...v, key: `${v.video_id}-${keyRef.current++}` }))
  }, [])

  const loadFresh = useCallback(async () => {
    setFailed(false)
    try {
      const batch = await fetchBatch([])
      setActiveIndex(0)
      setItems(batch)
    } catch {
      setFailed(true)
    }
  }, [fetchBatch])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUid(session?.user?.id ?? null))
    loadFresh()
  }, [loadFresh])

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    setItems(null)
    await loadFresh()
    setRefreshing(false)
  }

  // Endless scrolling: when you get near the end, fetch more.
  // If every reel was already shown, start again (oldest watched first).
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    try {
      const shown = itemsRef.current.map((i) => i.video_id).slice(-300)
      let batch = await fetchBatch(shown)
      if (batch.length === 0) batch = await fetchBatch([])
      if (batch.length > 0) setItems((list) => [...(list ?? []), ...batch])
    } catch {
      /* try again on the next scroll */
    } finally {
      loadingMoreRef.current = false
    }
  }, [fetchBatch])

  useEffect(() => {
    if (items && items.length - activeIndex <= 4) loadMore()
  }, [activeIndex, items, loadMore])

  // Work out which reel is on screen.
  useEffect(() => {
    const root = containerRef.current
    if (!root || !items?.length) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveIndex(Number(entry.target.dataset.index))
        }
      },
      { root, threshold: 0.6 },
    )
    root.querySelectorAll('[data-index]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [items])

  // Wait 250 ms after you stop swiping before loading a reel's player.
  // This saves data when you skip quickly through many reels.
  useEffect(() => {
    const t = setTimeout(() => setSettledIndex(activeIndex), 250)
    return () => clearTimeout(t)
  }, [activeIndex])

  // Count a view once a reel has been on screen for 1.5 seconds.
  useEffect(() => {
    const video = items?.[activeIndex]
    if (!video) return undefined
    const timer = setTimeout(() => {
      supabase.rpc('mark_reel_seen', { p_video_id: video.video_id })
    }, 1500)
    return () => clearTimeout(timer)
  }, [items, activeIndex])

  function toggleSound() {
    if (blocked) {
      setBlocked(false)
      return
    }
    const next = !soundOn
    setSoundOn(next)
    try {
      localStorage.setItem('reels_sound', next ? 'on' : 'off')
    } catch {
      /* ignore */
    }
  }

  function patchVideo(videoId, patch) {
    setItems((list) => list?.map((v) => (v.video_id === videoId ? { ...v, ...patch(v) } : v)))
  }

  async function toggleLike(videoId) {
    if (!uid) return
    const current = itemsRef.current.find((v) => v.video_id === videoId)
    if (!current) return
    const liking = !current.liked_by_me
    const change = liking ? 1 : -1
    patchVideo(videoId, (v) => ({ liked_by_me: liking, like_count: Math.max(0, Number(v.like_count) + change) }))

    const request = liking
      ? supabase.from('reel_likes').insert({ user_id: uid, video_id: videoId })
      : supabase.from('reel_likes').delete().eq('user_id', uid).eq('video_id', videoId)
    const { error } = await request
    if (error) {
      patchVideo(videoId, (v) => ({ liked_by_me: !liking, like_count: Math.max(0, Number(v.like_count) - change) }))
    }
  }

  function changeCommentCount(videoId, delta) {
    patchVideo(videoId, (v) => ({ comment_count: Math.max(0, Number(v.comment_count) + delta) }))
  }

  let body
  if (failed) {
    body = (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-sm text-white/70">
        <p>Couldn't load reels. Check your connection.</p>
        <button onClick={refresh} className="rounded-full border border-white/30 px-4 py-1.5 text-white">
          Try again
        </button>
      </div>
    )
  } else if (items === null) {
    body = <div className="flex h-full items-center justify-center text-sm text-white/50">Loading…</div>
  } else if (items.length === 0) {
    body = (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-white/70">
        No reels yet. Check back soon.
      </div>
    )
  } else {
    body = (
      <div
        ref={containerRef}
        className="h-full snap-y snap-mandatory overflow-y-scroll bg-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((video, index) => (
          <Reel
            key={video.key}
            video={video}
            index={index}
            isActive={index === activeIndex}
            shouldMount={
              index === settledIndex ||
              index === settledIndex - 1 ||
              // The next reel is only loaded AFTER the current one has started playing,
              // and never when Data Saver is on. This way the reel you watch gets all the data first.
              (index === settledIndex + 1 &&
                !network.saveData &&
                startedKey === items[settledIndex]?.key)
            }
            onPlaying={() => setStartedKey(video.key)}
            soundOn={soundOn && !blocked}
            blocked={blocked}
            onBlocked={() => setBlocked(true)}
            onUnblock={() => setBlocked(false)}
            onToggleSound={toggleSound}
            onLike={toggleLike}
            onOpenComments={setCommentFor}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-hidden bg-black">
      <style>{`@keyframes reel-pop{0%{opacity:0;transform:scale(.4)}25%{opacity:1;transform:scale(1.15)}100%{opacity:0;transform:scale(1)}}`}</style>

      {body}

      {/* Title and refresh button float on top of the video */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 pb-6 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
        <h1 className="text-xl font-semibold">Updates</h1>
        <button
          onClick={refresh}
          aria-label="Refresh reels"
          className="pointer-events-auto rounded-full p-2 text-white"
        >
          <RefreshIcon spinning={refreshing} />
        </button>
      </div>

      {blocked && soundOn && items?.length > 0 && (
        <button
          onClick={() => setBlocked(false)}
          className="absolute left-1/2 top-[calc(env(safe-area-inset-top)+4rem)] z-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-white"
        >
          Tap for sound
        </button>
      )}

      {commentFor && (
        <CommentsSheet
          video={commentFor}
          uid={uid}
          onClose={() => setCommentFor(null)}
          onCountChange={changeCommentCount}
        />
      )}
    </div>
  )
}
