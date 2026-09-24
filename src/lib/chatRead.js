export const LAST_READ_KEY = 'companion_last_read_at'

export function getLastReadAt() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(LAST_READ_KEY)
}

// Call this with the created_at of a message you've actually just shown
// on screen - a server timestamp - NEVER with a client-side `new
// Date()`/`Date.now()` reading. Mixing a client wall-clock reading with
// server-generated created_at values is what caused a message you were
// looking at live to still show up as "unread" the moment you left the
// chat: if the device's clock is even a second or two behind the
// database server's clock, the read-marker you just wrote could end up
// earlier than the message's own timestamp. Comparing server time to
// server time removes that entirely.
export function markReadUpTo(createdAt) {
  if (typeof window === 'undefined' || !createdAt) return
  const current = getLastReadAt()
  if (current && new Date(current) >= new Date(createdAt)) return
  localStorage.setItem(LAST_READ_KEY, createdAt)
}

export function isMessageUnread(message) {
  if (!message || message.sender !== 'companion') return false
  const lastReadAt = getLastReadAt()
  if (!lastReadAt) return true
  return new Date(message.created_at) > new Date(lastReadAt)
}