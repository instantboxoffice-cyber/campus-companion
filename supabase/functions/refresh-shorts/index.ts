import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

const YT = "https://www.googleapis.com/youtube/v3"
const MAX_SECONDS = 180 // YouTube Shorts can be up to 3 minutes
const KEEP_NEWEST = 300
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

async function idsForChannel(channelId: string, apiKey: string): Promise<string[]> {
  // A channel's uploads playlist id is its channel id with "UC" swapped for "UU".
  const data = await yt(
    "playlistItems",
    { part: "contentDetails", playlistId: "UU" + channelId.slice(2), maxResults: "25" },
    apiKey,
  )
  return (data.items ?? []).map((i: any) => i.contentDetails?.videoId).filter(Boolean)
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
      { part: "snippet,contentDetails,status", id: ids.slice(i, i + 50).join(",") },
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

  const db = createClient(supabaseUrl, supabaseKey)
  let added = 0
  let quotaHit = false
  const problems: string[] = []

  const { data: sources, error: sourcesError } = await db
    .from("shorts_sources")
    .select("*")
    .eq("active", true)
  if (sourcesError) return json({ error: sourcesError.message }, 500)

  for (const source of sources ?? []) {
    try {
      let ids: string[] = []

      if (source.kind === "channel") {
        let channelId = source.channel_id
        if (!channelId) {
          channelId = await resolveChannelId(source.value, apiKey)
          if (channelId) {
            await db.from("shorts_sources").update({ channel_id: channelId }).eq("id", source.id)
          }
        }
        if (!channelId) {
          problems.push(`Could not find channel ${source.value}`)
          continue
        }
        ids = await idsForChannel(channelId, apiKey)
      } else {
        ids = await idsForSearch(source.value, apiKey)
      }

      if (ids.length === 0) continue

      const rows = (await detailsFor(ids, apiKey))
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
        break
      }
      console.error("refresh-shorts source failed", source.value, err instanceof Error ? err.message : err)
      problems.push(`${source.value}: ${err instanceof Error ? err.message : "failed"}`)
    }
  }

  // Keep the table small: drop everything older than the newest KEEP_NEWEST.
  const { data: old } = await db
    .from("shorts_feed")
    .select("video_id")
    .order("published_at", { ascending: false })
    .range(KEEP_NEWEST, KEEP_NEWEST + 999)
  if (old && old.length > 0) {
    await db.from("shorts_feed").delete().in("video_id", old.map((r) => r.video_id))
  }

  return json({ sources: sources?.length ?? 0, added, quotaHit, problems })
})
