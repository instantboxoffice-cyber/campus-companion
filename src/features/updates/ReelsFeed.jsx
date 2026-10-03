import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function ReelsFeed() {
  const [videos, setVideos] = useState(null) // null = still loading
  const [failed, setFailed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [soundOn, setSoundOn] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('shorts_feed')
        .select('video_id, title, channel_title, thumbnail_url')
        .order('published_at', { ascending: false })
        .limit(60)

      if (cancelled) return
      if (error) setFailed(true)
      else setVideos(data ?? [])
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Only the reel that is mostly on screen gets a real player.
  useEffect(() => {
    const root = containerRef.current
    if (!root || !videos?.length) return undefined

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
  }, [videos])

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-white/70">
        Couldn't load reels. Check your connection and reopen this tab.
      </div>
    )
  }

  if (videos === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/50">Loading…</div>
    )
  }

  if (videos.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-white/70">
        No reels yet. Check back soon.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-full snap-y snap-mandatory overflow-y-scroll bg-black"
    >
      {videos.map((video, index) => (
        <section
          key={video.video_id}
          data-index={index}
          className="flex h-full snap-start snap-always flex-col bg-black"
        >
          <div className="flex min-h-0 flex-1 justify-center">
            <div className="h-full bg-black" style={{ aspectRatio: '9 / 16', maxWidth: '100%' }}>
              {index === activeIndex ? (
                <iframe
                  title={video.title}
                  className="h-full w-full"
                  src={`https://www.youtube-nocookie.com/embed/${video.video_id}?autoplay=1&mute=${soundOn ? 0 : 1}&playsinline=1&loop=1&playlist=${video.video_id}&rel=0&modestbranding=1`}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              ) : (
                video.thumbnail_url && (
                  <img
                    src={video.thumbnail_url}
                    alt=""
                    className="h-full w-full object-cover opacity-60"
                  />
                )
              )}
            </div>
          </div>

          {/* Everything below sits UNDER the player, never over it. */}
          <div className="flex items-center gap-3 px-4 py-3 text-white">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium">{video.title}</p>
              <p className="mt-0.5 truncate text-xs text-white/60">{video.channel_title}</p>
            </div>
            <button
              onClick={() => setSoundOn((on) => !on)}
              className="shrink-0 rounded-full border border-white/30 px-3 py-1.5 text-xs"
            >
              {soundOn ? 'Sound on' : 'Sound off'}
            </button>
            <a
              href={`https://www.youtube.com/shorts/${video.video_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs text-white/70 underline"
            >
              YouTube
            </a>
          </div>
        </section>
      ))}
    </div>
  )
}
