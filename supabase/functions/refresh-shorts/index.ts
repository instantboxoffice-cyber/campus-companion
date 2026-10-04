import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

const YT = "https://www.googleapis.com/youtube/v3"
const MAX_SECONDS = 180 // YouTube Shorts can be up to 3 minutes
const KEEP_NEWEST = 3000 // how many reels to keep in the pool
const REGION = "NG"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

class QuotaError extends Error {}

function parseDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "")
  if (!m) return 0
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

async function yt(path: string, params: Record<string, string>, apiKey: string) {
  const url = new URL(`${YT}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set("key", apiKey)
  const res = await fetch(url)
  if (res.status === 403) {
    const body = await res.text()
    if (body.includes("quotaExceeded")) throw new QuotaError("YouTube quota exceeded")
    throw new Error(`YouTube ${path} returned 403`)
  }
  if (!res.ok) throw new Error(`YouTube ${path} failed with ${res.status}`)
  return res.json()
}

async function resolveChannelId(value: string, apiKey: string): Promise<string | null> {
  if (value.startsWith("UC")) return value
  const handle = value.startsWith("@") ? value : `@${value}`
  const data = await yt("channels", { part: "id", forHandle: handle }, apiKey)
  return data.items?.[0]?.id ?? null
}

async function idsForChannel(channelId: string, apiKey: string, pages: number): Promise<string[]> {
  // A channel's uploads playlist id is its channel id with "UC" swapped for "UU".
  // Read up to `pages` pages of 50 newest uploads. Each page costs only 1 quota unit.
  const ids: string[] = []
  let pageToken = ""
  for (let page = 0; page < pages; page++) {
    const params: Record<string, string> = {
      part: "contentDetails",
      playlistId: "UU" + channelId.slice(2),
      maxResults: "50",
    }
    if (pageToken) params.pageToken = pageToken
    const data = await yt("playlistItems", params, apiKey)
    ids.push(...(data.items ?? []).map((i: any) => i.contentDetails?.videoId).filter(Boolean))
    pageToken = data.nextPageToken ?? ""
    if (!pageToken) break
  }
  return ids
}

async function idsForSearch(query: string, apiKey: string): Promise<string[]> {
  const data = await yt(
    "search",
    {
      part: "id",
      type: "video",
      videoDuration: "short",
      videoEmbeddable: "true",
      q: query,
      order: "date",
      maxResults: "15",
      regionCode: REGION,
    },
    apiKey,
  )
  return (data.items ?? []).map((i: any) => i.id?.videoId).filter(Boolean)
}

async function detailsFor(ids: string[], apiKey: string) {
  const out: any[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const data = await yt(
      "videos",
      { part: "snippet,contentDetails,status,statistics", id: ids.slice(i, i + 50).join(",") },
      apiKey,
    )
    out.push(...(data.items ?? []))
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })

  const cronSecret = Deno.env.get("CRON_SECRET")
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "Unauthorized" }, 401)
  }

  const apiKey = Deno.env.get("YOUTUBE_API_KEY")
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!apiKey || !supabaseUrl || !supabaseKey) {
    return json({ error: "Missing YOUTUBE_API_KEY or Supabase credentials" }, 500)
  }

  // This runs every 30 minutes, so it must be cheap on YouTube quota (10,000 units/day):
  //  - normal run: only the 50 newest uploads per channel, and only videos we do not have yet
  //  - once a day (03:00 UTC) or when called with {"full": true}: deeper, and refreshes view counts
  //  - search sources cost 100 units each, so they only run 4 times a day
  const body = await req.json().catch(() => ({}))
  const now = new Date()
  const hour = now.getUTCHours()
  const minute = now.getUTCMinutes()
  const deepRun = body?.full === true || (hour === 3 && minute < 30)
  const searchRun = deepRun || (hour % 6 === 0 && minute < 30)

  const db = createClient(supabaseUrl, supabaseKey)
  let added = 0
  let quotaHit = false
  const problems: string[] = []

  const { data: sources, error: sourcesError } = await db
    .from("shorts_sources")
    .select("*")
    .eq("active", true)
  if (sourcesError) return json({ error: sourcesError.message }, 500)

  const todo = (sources ?? []).filter((s: any) => s.kind === "channel" || searchRun)

  async function processSource(source: any) {
    if (quotaHit) return
    try {
      let ids: string[] = []

      if (source.kind === "channel") {
        let channelId = source.channel_id
        const firstTime = !channelId
        if (!channelId) {
          channelId = await resolveChannelId(source.value, apiKey!)
          if (!channelId) {
            // Bad handle: switch it off so it stops costing quota, and report it.
            await db.from("shorts_sources").update({ active: false }).eq("id", source.id)
            problems.push(`Could not find channel ${source.value} (switched off)`)
            return
          }
          await db.from("shorts_sources").update({ channel_id: channelId }).eq("id", source.id)
        }
        // A brand-new channel gets a deep first read (150 videos); later runs read 50.
        ids = await idsForChannel(channelId, apiKey!, firstTime || deepRun ? 3 : 1)
      } else {
        ids = await idsForSearch(source.value, apiKey!)
      }

      if (ids.length === 0) return

      if (!deepRun) {
        const { data: have } = await db.from("shorts_feed").select("video_id").in("video_id", ids)
        const known = new Set((have ?? []).map((r: any) => r.video_id))
        ids = ids.filter((id) => !known.has(id))
        if (ids.length === 0) return
      }

      const rows = (await detailsFor(ids, apiKey!))
        .filter((v) => {
          const seconds = parseDuration(v.contentDetails?.duration)
          return (
            v.status?.embeddable === true &&
            v.status?.privacyStatus === "public" &&
            v.snippet?.liveBroadcastContent === "none" &&
            seconds > 0 &&
            seconds <= MAX_SECONDS
          )
        })
        .map((v) => ({
          video_id: v.id,
          title: v.snippet.title,
          channel_id: v.snippet.channelId,
          channel_title: v.snippet.channelTitle,
          thumbnail_url: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.high?.url ?? null,
          duration_seconds: parseDuration(v.contentDetails.duration),
          view_count: Number(v.statistics?.viewCount ?? 0),
          yt_like_count: Number(v.statistics?.likeCount ?? 0),
          yt_comment_count: Number(v.statistics?.commentCount ?? 0),
          published_at: v.snippet.publishedAt,
          source_id: source.id,
          fetched_at: new Date().toISOString(),
        }))

      if (rows.length > 0) {
        const { error } = await db.from("shorts_feed").upsert(rows, { onConflict: "video_id" })
        if (error) problems.push(error.message)
        else added += rows.length
      }
    } catch (err) {
      if (err instanceof QuotaError) {
        quotaHit = true
        return
      }
      console.error("refresh-shorts source failed", source.value, err instanceof Error ? err.message : err)
      problems.push(`${source.value}: ${err instanceof Error ? err.message : "failed"}`)
    }
  }

  // 5 sources at a time, so many channels still finish inside the time limit.
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(todo.slice(i, i + 5).map(processSource))
    if (quotaHit) break
  }

  // Keep the table size under control: drop everything older than the newest KEEP_NEWEST.
  const { data: old } = await db
    .from("shorts_feed")
    .select("video_id")
    .order("published_at", { ascending: false })
    .range(KEEP_NEWEST, KEEP_NEWEST + 999)
  if (old && old.length > 0) {
    await db.from("shorts_feed").delete().in("video_id", old.map((r) => r.video_id))
  }

  return json({ sources: todo.length, added, quotaHit, deepRun, searchRun, problems })
})
