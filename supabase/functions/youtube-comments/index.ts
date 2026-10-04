import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

// Reads the top comments of a YouTube video so the app can show them (read only).
// Saved for 6 hours, so many people opening the same reel cost YouTube quota only once.

const CACHE_HOURS = 6
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })

  const apiKey = Deno.env.get("YOUTUBE_API_KEY")
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!apiKey || !supabaseUrl || !serviceKey) return json({ error: "Server not set up" }, 500)

  const db = createClient(supabaseUrl, serviceKey)

  // Only signed-in users may call this.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  const { data: userData } = await db.auth.getUser(token)
  if (!userData?.user) return json({ error: "Unauthorized" }, 401)

  const body = await req.json().catch(() => ({}))
  const videoId = String(body?.video_id ?? "")
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return json({ error: "Bad video id" }, 400)

  const { data: cached } = await db
    .from("yt_comments_cache")
    .select("comments, disabled, fetched_at")
    .eq("video_id", videoId)
    .maybeSingle()

  const fresh = cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_HOURS * 3600_000
  if (fresh) return json({ comments: cached.comments, disabled: cached.disabled })

  const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads")
  url.searchParams.set("part", "snippet")
  url.searchParams.set("videoId", videoId)
  url.searchParams.set("maxResults", "40")
  url.searchParams.set("order", "relevance")
  url.searchParams.set("textFormat", "plainText")
  url.searchParams.set("key", apiKey)

  const res = await fetch(url)

  if (!res.ok) {
    const text = await res.text()
    if (text.includes("commentsDisabled")) {
      await db.from("yt_comments_cache").upsert({ video_id: videoId, comments: [], disabled: true, fetched_at: new Date().toISOString() })
      return json({ comments: [], disabled: true })
    }
    // Quota used up or another problem: show older saved comments if we have any.
    return json({ comments: cached?.comments ?? [], disabled: false, unavailable: true })
  }

  const data = await res.json()
  const comments = (data.items ?? []).map((item: any) => {
    const c = item.snippet?.topLevelComment?.snippet ?? {}
    return {
      id: item.id,
      author: c.authorDisplayName ?? "YouTube user",
      avatar: c.authorProfileImageUrl ?? null,
      text: c.textDisplay ?? "",
      likes: c.likeCount ?? 0,
      published_at: c.publishedAt ?? null,
    }
  })

  await db
    .from("yt_comments_cache")
    .upsert({ video_id: videoId, comments, disabled: false, fetched_at: new Date().toISOString() })

  return json({ comments, disabled: false })
})
