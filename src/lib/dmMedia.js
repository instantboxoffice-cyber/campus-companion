import { supabase } from './supabaseClient'

// Everything about files in friend chats: photos, documents and voice notes.
// They live in a private Supabase bucket. Only the sender and the person the
// message was sent to can open them.
export const DM_BUCKET = 'dm-media'
export const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25 MB, same as the bucket limit

export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function fileExtension(name = '') {
  const i = name.lastIndexOf('.')
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase().slice(0, 5) : ''
}

// Storage paths must be plain. Keep the real name in the database instead.
function safeName(name) {
  const ext = fileExtension(name)
  return ext ? `${crypto.randomUUID()}.${ext}` : crypto.randomUUID()
}

// Shrinks big phone photos before sending (saves data and storage).
// Falls back to the original file if the browser can't do it.
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 600 * 1024) {
      bitmap.close?.()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// Saves a file and returns its path, e.g. "MY_ID/abc123.pdf".
export async function uploadDmFile(file, userId) {
  const path = `${userId}/${safeName(file.name || 'file')}`
  const { error } = await supabase.storage.from(DM_BUCKET).upload(path, file, {
    contentType: (file.type || 'application/octet-stream').split(';')[0],
    cacheControl: '31536000',
  })
  if (error) {
    console.error('Upload failed', error)
    throw new Error("Couldn't upload that file. Check your connection and try again.")
  }
  return path
}

export function removeDmFile(path) {
  if (!path) return
  supabase.storage.from(DM_BUCKET).remove([path]).catch(() => {})
}

// Private files need a temporary link. Remember them so each file asks once.
const linkCache = new Map()
const LINK_LIFETIME_S = 6 * 60 * 60

export async function getDmFileUrl(path) {
  const hit = linkCache.get(path)
  if (hit && hit.expires > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(DM_BUCKET).createSignedUrl(path, LINK_LIFETIME_S)
  if (error || !data?.signedUrl) throw new Error("Couldn't load this file.")
  linkCache.set(path, { url: data.signedUrl, expires: Date.now() + (LINK_LIFETIME_S - 600) * 1000 })
  return data.signedUrl
}

export function forgetDmFileUrl(path) {
  linkCache.delete(path)
}

// Downloads a file under its real name (the signed link alone would give a random name).
export async function downloadDmFile(path, name) {
  try {
    const url = await getDmFileUrl(path)
    const res = await fetch(url)
    if (!res.ok) throw new Error('download failed')
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = name || 'file'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000)
    return true
  } catch {
    // Some browsers block this. Opening the link lets the person save it by hand.
    try {
      window.open(await getDmFileUrl(path), '_blank', 'noopener')
    } catch {
      // nothing else to try
    }
    return false
  }
}

// Short text for the reply quote and the chat list.
export function dmPreview(msg) {
  if (!msg) return ''
  const text = (msg.content || '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim()
  if (msg.attachment_type === 'audio') return '🎤 Voice message'
  if (msg.attachment_type === 'image') return text ? `📷 ${text}` : '📷 Photo'
  if (msg.attachment_type === 'file') return `📄 ${msg.attachment_name || 'Document'}`
  return text.length > 100 ? `${text.slice(0, 99)}…` : text
}
