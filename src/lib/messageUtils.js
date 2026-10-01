// Small helpers used by the chat screen. Nothing here touches React.

export function formatBubbleTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function isSameDay(a, b) {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

// "Today", "Yesterday", "Monday", or "12 Sep" - the little date chip between days.
export function dayLabel(iso) {
  const d = new Date(iso)
  const now = new Date()
  if (isSameDay(d, now)) return 'Today'

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(d, yesterday)) return 'Yesterday'

  const daysAgo = (now - d) / 86400000
  if (daysAgo < 7) return d.toLocaleDateString([], { weekday: 'long' })

  return d.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

// Removes the *bold* / _italic_ / ~strike~ / `code` marks so a short
// preview (like the quote inside a reply) reads as clean text.
export function plainPreview(text, max = 100) {
  const clean = (text || '')
    .replace(/```/g, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

export function messagePreview(msg) {
  const base = plainPreview(msg?.content)
  if (msg?.image_url) return base ? `📷 ${base}` : '📷 Picture'
  return base
}

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the older method below
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// "https://xyz.supabase.co/storage/v1/object/public/chat-images/USER/abc.jpg"
// -> "USER/abc.jpg" (the path Supabase Storage needs to delete the file).
export function storagePathFromUrl(url) {
  if (!url) return null
  const marker = '/chat-images/'
  const i = url.indexOf(marker)
  if (i < 0) return null
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0])
}

export async function saveImage(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('download failed')
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = `companion-${Date.now()}.${blob.type.includes('png') ? 'png' : 'jpg'}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000)
    return true
  } catch {
    // Some browsers block the direct download - opening the picture lets
    // the person press-and-hold to save it instead.
    window.open(url, '_blank', 'noopener')
    return false
  }
}