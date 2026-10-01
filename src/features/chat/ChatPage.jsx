import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { registerPushNotifications } from '../../lib/pushNotifications'
import { sounds } from '../../lib/sounds'
import { markReadUpTo } from '../../lib/chatRead'
import { loadVoicePrefs, saveVoicePrefs, speakText, stopSpeaking, unlockAudio } from '../../lib/voice'
import {
  copyToClipboard,
  dayLabel,
  isSameDay,
  messagePreview,
  saveImage,
  storagePathFromUrl,
} from '../../lib/messageUtils'
import Avatar from '../../components/Avatar'
import { BackArrowIcon, MoreVerticalIcon, SearchIcon, XIcon } from '../../components/Icons'
import { ChevronDownIcon, DownloadIcon } from '../../components/ChatIcons'
import MessageBubble from './MessageBubble'
import MessageSheet from './MessageSheet'
import ConfirmDialog from './ConfirmDialog'
import Composer from './Composer'
import VoiceSettings from './VoiceSettings'
import companionAvatar from '../../assets/companion-avatar.png'
import './chat.css'

const SOFT_ASK_DISMISS_KEY = 'notif_soft_ask_dismiss_count'
const DENIED_NOTICE_SEEN_KEY = 'notif_denied_notice_seen'
const MAX_SOFT_ASKS = 3

const PAGE_SIZE = 60
const CACHE_KEY = 'cc_chat_cache_v1'
const CACHE_LIMIT = 40
const GROUP_GAP_MS = 5 * 60 * 1000

const SUGGESTIONS = [
  { icon: '⏰', text: 'Remind me to drink water at 5pm today' },
  { icon: '🎨', text: 'Draw a sunset over Ondo city' },
  { icon: '📚', text: 'Help me plan my study day' },
  { icon: '💬', text: 'What can you do?' },
]

function canRequestNotificationPermission() {
  return (
    window.isSecureContext &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

function isNearBottom(el) {
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 200
}

// ---- instant-open cache ---------------------------------------------------
// The last few messages are kept on the device, so the chat paints instantly
// while the fresh copy loads from the server in the background.
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.messages) ? parsed.messages.map((m) => ({ ...m, _cached: true })) : []
  } catch {
    return []
  }
}

function writeCache(userId, messages) {
  try {
    const clean = messages
      .filter((m) => !m._tempId && !m._local)
      .slice(-CACHE_LIMIT)
      .map((m) => Object.fromEntries(Object.entries(m).filter(([key]) => !key.startsWith('_'))))
    localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: userId, messages: clean }))
  } catch {
    // Storage full or blocked - the cache is only a speed-up, so ignore it.
  }
}

// Swaps a "sending…" placeholder for the real saved message.
function settleTemp(list, tempId, real) {
  if (list.some((m) => m.id === real.id)) return list.filter((m) => m._tempId !== tempId)
  return list.map((m) => (m._tempId === tempId ? { ...real, _key: tempId } : m))
}

export default function ChatPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [messages, setMessages] = useState(readCache)
  const [loadState, setLoadState] = useState('loading')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sending, setSending] = useState(false)
  const [userId, setUserId] = useState(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  // Tracks whether a push subscription is ACTUALLY saved server-side -
  // separate from notifPermission, which only reflects the OS-level
  // permission prompt.
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [showSoftAsk, setShowSoftAsk] = useState(false)
  const [showDeniedNotice, setShowDeniedNotice] = useState(false)

  const [replyTo, setReplyTo] = useState(null)
  const [sheetMsg, setSheetMsg] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [toast, setToast] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [starredOnly, setStarredOnly] = useState(false)
  const [flashId, setFlashId] = useState(null)
  const [atBottom, setAtBottom] = useState(true)
  const [unseen, setUnseen] = useState(0)
  const [voicePrefs, setVoicePrefs] = useState(loadVoicePrefs)
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false)
  const [speakingId, setSpeakingId] = useState(null)

  const scrollRef = useRef(null)
  const composerRef = useRef(null)
  const messagesRef = useRef(messages)
  const knownIdsRef = useRef(new Set())
  const sendingRef = useRef(false)
  const scrollTickRef = useRef(0)
  const toastTimerRef = useRef(null)
  const forwardedQueryHandledRef = useRef(false)
  const voicePrefsRef = useRef(voicePrefs)
  const speakingIdRef = useRef(null)
  // Tells the scroll effect what to do after the next render:
  // 'bottom-instant' | 'bottom-smooth' | { restore } | null
  const scrollIntentRef = useRef(messages.length > 0 ? 'bottom-instant' : null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const showToast = useCallback((text) => {
    setToast(text)
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2200)
  }, [])

  useEffect(() => () => clearTimeout(toastTimerRef.current), [])

  // Stops any reading aloud when this screen closes.
  useEffect(() => () => stopSpeaking(), [])

  // ---- voice ---------------------------------------------------------------
  function handleVoicePrefsChange(next) {
    voicePrefsRef.current = next
    setVoicePrefs(next)
    saveVoicePrefs(next)
  }

  // Reads one message aloud. Tapping it again stops it.
  const speakMessage = useCallback(
    async (msg) => {
      if (!msg?.content) return

      if (speakingIdRef.current === msg.id) {
        stopSpeaking()
        speakingIdRef.current = null
        setSpeakingId(null)
        return
      }

      unlockAudio()
      speakingIdRef.current = msg.id
      setSpeakingId(msg.id)
      try {
        await speakText(msg.content, { natural: voicePrefsRef.current.natural, onNotice: showToast })
      } finally {
        if (speakingIdRef.current === msg.id) {
          speakingIdRef.current = null
          setSpeakingId(null)
        }
      }
    },
    [showToast]
  )

  // ---- notifications (unchanged behaviour) ---------------------------------
  async function attemptPushRegistration(uid) {
    if (!uid) return { enabled: false, reason: 'User is not signed in yet.' }
    try {
      const result = await registerPushNotifications(supabase, uid)
      setPushSubscribed(result.enabled)
      if (!result.enabled) {
        console.info('Push notifications were not enabled:', result.reason)
      }
      return result
    } catch (error) {
      console.error('Push registration error:', error)
      setPushSubscribed(false)
      return { enabled: false, reason: error?.message || 'Unknown error while subscribing.' }
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const nextUserId = user?.id ?? null
      setUserId(nextUserId)

      if (nextUserId) {
        attemptPushRegistration(nextUserId)
      }
    })
  }, [])

  useEffect(() => {
    if (!canRequestNotificationPermission()) return
    if (Notification.permission !== 'denied') return
    if (localStorage.getItem(DENIED_NOTICE_SEEN_KEY)) return
    setShowDeniedNotice(true)
  }, [])

  async function requestAndRegisterNotifications() {
    if (!canRequestNotificationPermission()) {
      window.alert('This browser/context does not support push notifications.')
      return
    }

    const permission = await Notification.requestPermission()
    setNotifPermission(permission)

    if (permission === 'granted') {
      const result = await attemptPushRegistration(userId)
      if (!result.enabled) {
        window.alert(`Notifications are on, but subscribing failed: ${result.reason}`)
      }
    }
  }

  async function handleEnableNotifications() {
    setMenuOpen(false)

    if (!('Notification' in window)) {
      window.alert('This browser does not support notifications.')
      return
    }

    if (Notification.permission === 'denied') {
      window.alert('Notification permission was denied. Enable notifications in the browser settings.')
      return
    }

    if (Notification.permission === 'granted') {
      const result = await attemptPushRegistration(userId)
      if (!result.enabled) {
        window.alert(`Notifications are on, but subscribing failed: ${result.reason}`)
      }
      return
    }

    await requestAndRegisterNotifications()
  }

  function handleToggleMute() {
    const next = sounds.toggleMuted()
    setMuted(next)
    setMenuOpen(false)
  }

  // ---- loading messages ----------------------------------------------------
  const loadMessages = useCallback(async (uid) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (error) {
      console.error('Could not load messages', error)
      setLoadState('error')
      return
    }

    const rows = data.reverse()
    rows.forEach((r) => knownIdsRef.current.add(r.id))

    if (isNearBottom(scrollRef.current)) scrollIntentRef.current = 'bottom-instant'

    // The device copy is replaced by the fresh server copy; anything sent
    // or received while this was loading is kept.
    setMessages((prev) => {
      const ids = new Set(rows.map((r) => r.id))
      const extras = prev.filter((m) => !m._cached && !ids.has(m.id))
      return [...rows, ...extras]
    })
    setHasMore(data.length === PAGE_SIZE)
    setLoadState('ready')
  }, [])

  async function loadOlder() {
    if (loadingMore || !hasMore) return
    const oldest = messagesRef.current.find((m) => !m._tempId && !m._local && !m._cached)
    if (!oldest) return

    setLoadingMore(true)
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    setLoadingMore(false)

    if (error) {
      showToast("Couldn't load older messages")
      return
    }

    const rows = data.reverse()
    rows.forEach((r) => knownIdsRef.current.add(r.id))

    const el = scrollRef.current
    scrollIntentRef.current = el ? { restore: { height: el.scrollHeight, top: el.scrollTop } } : null

    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id))
      return [...rows.filter((r) => !ids.has(r.id)), ...prev]
    })
    setHasMore(data.length === PAGE_SIZE)
  }

  // A message arriving from the server (live), from either side.
  const applyIncoming = useCallback(
    (row) => {
      if (knownIdsRef.current.has(row.id)) return
      knownIdsRef.current.add(row.id)

      const fromCompanion = row.sender === 'companion'
      if (fromCompanion) sounds.received()

      const nearBottom = isNearBottom(scrollRef.current)
      if (fromCompanion && !nearBottom) {
        scrollIntentRef.current = null
        setUnseen((n) => n + 1)
      } else {
        scrollIntentRef.current = 'bottom-smooth'
      }

      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev
        if (!fromCompanion) {
          const idx = prev.findIndex(
            (m) => m._tempId && m.status === 'sending' && m.content === row.content
          )
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = { ...row, _key: prev[idx]._key }
            return next
          }
        }
        return [...prev, fromCompanion ? { ...row, _fresh: true } : row]
      })
    },
    []
  )

  useEffect(() => {
    if (!userId) return
    loadMessages(userId)

    const channel = supabase
      .channel('chat-page-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) =>
        applyIncoming(payload.new)
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) =>
        setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m)))
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        const id = payload.old?.id
        if (id !== undefined && id !== null) setMessages((prev) => prev.filter((m) => m.id !== id))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, loadMessages, applyIncoming])

  // Keeps a small copy on the device so the chat opens instantly next time.
  useEffect(() => {
    if (!userId || loadState !== 'ready') return
    const timer = setTimeout(() => writeCache(userId, messages), 600)
    return () => clearTimeout(timer)
  }, [messages, userId, loadState])

  // ---- scrolling -----------------------------------------------------------
  useLayoutEffect(() => {
    const el = scrollRef.current
    const intent = scrollIntentRef.current
    scrollIntentRef.current = null
    if (!el || !intent) return

    if (intent === 'bottom-instant') {
      el.scrollTop = el.scrollHeight
    } else if (intent === 'bottom-smooth') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    } else if (intent.restore) {
      el.scrollTop = intent.restore.top + (el.scrollHeight - intent.restore.height)
    }
  }, [messages])

  useEffect(() => {
    const el = scrollRef.current
    if (sending && el && isNearBottom(el)) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [sending])

  function handleScroll() {
    if (scrollTickRef.current) return
    scrollTickRef.current = requestAnimationFrame(() => {
      scrollTickRef.current = 0
      const el = scrollRef.current
      if (!el) return
      const near = isNearBottom(el)
      setAtBottom(near)
      if (near) setUnseen(0)
    })
  }

  function scrollToBottom() {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setUnseen(0)
  }

  // Mark as read using the LAST SAVED MESSAGE'S OWN server timestamp, never
  // a client-side "now" (see chatRead.js for why that matters).
  useEffect(() => {
    if (!atBottom) return
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (!m._tempId && !m._local && m.created_at) {
        markReadUpTo(m.created_at)
        break
      }
    }
  }, [messages, atBottom])

  // ---- sending -------------------------------------------------------------
  const sendMessage = useCallback(
    async (rawText, reply = null, meta = {}) => {
      const text = rawText.trim()
      if (!text || sendingRef.current || !userId) return false

      sendingRef.current = true
      setSending(true)
      sounds.sent()

      const tempId = `tmp-${crypto.randomUUID()}`
      const replyFields = reply
        ? {
            reply_to_id: String(reply.id),
            reply_sender: reply.sender,
            reply_preview: messagePreview(reply),
          }
        : {}

      // Show the message on screen straight away - no waiting for the server.
      scrollIntentRef.current = 'bottom-smooth'
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          _tempId: tempId,
          _key: tempId,
          status: 'sending',
          user_id: userId,
          sender: 'user',
          content: text,
          created_at: new Date().toISOString(),
          ...replyFields,
        },
      ])

      try {
        const { data: userMsg, error: userMsgError } = await supabase
          .from('messages')
          .insert({ user_id: userId, sender: 'user', content: text, ...replyFields })
          .select()
          .single()

        if (userMsgError) {
          console.error(userMsgError)
          setMessages((prev) => prev.map((m) => (m._tempId === tempId ? { ...m, status: 'failed' } : m)))
          return false
        }

        knownIdsRef.current.add(userMsg.id)
        setMessages((prev) => settleTemp(prev, tempId, userMsg))

        // The AI gets the last 10 messages. A reply is passed along with the
        // message it points to, so the AI understands what "this" means.
        const history = [
          ...messagesRef.current.filter(
            (m) => m.id !== tempId && m.id !== userMsg.id && !m._tempId && !m._local
          ),
          userMsg,
        ]
          .slice(-10)
          .map((m) => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.reply_preview
              ? `[Replying to ${m.reply_sender === 'user' ? 'their own message' : 'your message'}: "${m.reply_preview}"]\n${m.content}`
              : m.content,
          }))

        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const localTime = new Date().toLocaleString('sv-SE', { timeZone: timezone }).replace(' ', 'T')

        // IMPORTANT: must go through supabase.functions.invoke(), not a plain
        // fetch('/functions/v1/...') - a relative URL would hit this site's
        // own origin (and vercel.json's catch-all rewrite) instead of Supabase.
        const { data: parsed, error: invokeError } = await supabase.functions.invoke('parse-reminder', {
          body: { history, timezone, localTime },
        })

        if (invokeError) console.error('parse-reminder failed', invokeError)

        if (parsed?.message) {
          applyIncoming(parsed.message)
          // Replies to a spoken message are read aloud; so is every reply if "Read replies aloud" is on.
          if (meta.viaVoice || voicePrefsRef.current.readAloud) speakMessage(parsed.message)
        } else {
          scrollIntentRef.current = 'bottom-smooth'
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              _local: true,
              _fresh: true,
              user_id: userId,
              sender: 'companion',
              content: parsed?.reply || "Hmm, something went wrong on my end — mind trying that again?",
              created_at: new Date().toISOString(),
            },
          ])
        }

        if (
          parsed?.intent === 'reminder' &&
          canRequestNotificationPermission() &&
          Notification.permission === 'default'
        ) {
          const dismissCount = Number(localStorage.getItem(SOFT_ASK_DISMISS_KEY) || 0)
          if (dismissCount < MAX_SOFT_ASKS) setShowSoftAsk(true)
        }
        return true
      } finally {
        sendingRef.current = false
        setSending(false)
      }
    },
    [userId, applyIncoming, speakMessage]
  )

  // Called by the typing box. Returns true if the message was accepted.
  function submitFromComposer(text, meta = {}) {
    if (sendingRef.current || !text.trim()) return false
    sendMessage(text, replyTo, meta)
    setReplyTo(null)
    return true
  }

  function retrySend(msg) {
    setMessages((prev) => prev.filter((m) => m.id !== msg.id))
    const reply = msg.reply_preview
      ? { id: msg.reply_to_id, sender: msg.reply_sender, content: msg.reply_preview }
      : null
    sendMessage(msg.content, reply)
  }

  // Picks up a question forwarded here from the Chats-tab search bar and
  // sends it as a real message. The ref guard stops React StrictMode (which
  // runs effects twice in dev) from sending it twice.
  useEffect(() => {
    if (!userId) return
    if (forwardedQueryHandledRef.current) return
    const forwardedQuery = location.state?.forwardedQuery
    if (!forwardedQuery) return

    forwardedQueryHandledRef.current = true
    sendMessage(forwardedQuery)
    navigate(location.pathname, { replace: true, state: null })
  }, [userId, location.state, location.pathname, navigate, sendMessage])

  // ---- message actions -----------------------------------------------------
  const openActions = useCallback((msg) => setSheetMsg(msg), [])

  const startReply = useCallback((msg) => {
    setSheetMsg(null)
    setReplyTo(msg)
    composerRef.current?.focus()
  }, [])

  const openImage = useCallback((url) => setLightbox(url), [])

  const jumpTo = useCallback(
    (id) => {
      const el = document.getElementById(`msg-${id}`)
      if (!el) {
        showToast("That message isn't loaded")
        return
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setFlashId(id)
      setTimeout(() => setFlashId(null), 1400)
    },
    [showToast]
  )

  function patchMessage(id, patch) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  // Saves a change to one message; puts it back if the server refuses.
  async function saveChange(msg, patch) {
    if (msg._tempId || msg._local) {
      showToast("That message wasn't saved yet")
      return
    }
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, msg[k] ?? null]))
    patchMessage(msg.id, patch)

    const { data, error } = await supabase.from('messages').update(patch).eq('id', msg.id).select('id')
    if (error || !data?.length) {
      console.error('Could not save message change', error)
      patchMessage(msg.id, before)
      showToast("Couldn't save that. Try again.")
    }
  }

  function handleReact(msg, emoji) {
    setSheetMsg(null)
    saveChange(msg, { reaction: msg.reaction === emoji ? null : emoji })
  }

  function handleStar(msg) {
    setSheetMsg(null)
    saveChange(msg, { starred: !msg.starred })
  }

  async function handleCopy(msg) {
    setSheetMsg(null)
    showToast((await copyToClipboard(msg.content)) ? 'Copied' : "Couldn't copy")
  }

  async function handleShare(msg) {
    setSheetMsg(null)
    try {
      await navigator.share(msg.image_url ? { text: msg.content || '', url: msg.image_url } : { text: msg.content })
    } catch {
      // Person closed the share sheet - nothing to do.
    }
  }

  async function handleSaveImage(msg) {
    setSheetMsg(null)
    showToast((await saveImage(msg.image_url)) ? 'Picture saved' : 'Opening picture…')
  }

  function askDelete(msg) {
    setSheetMsg(null)
    setPendingDelete(msg)
  }

  async function confirmDelete() {
    const msg = pendingDelete
    setPendingDelete(null)
    if (!msg) return

    if (replyTo?.id === msg.id) setReplyTo(null)

    if (msg._tempId || msg._local) {
      setMessages((prev) => prev.filter((m) => m.id !== msg.id))
      return
    }

    setMessages((prev) => prev.filter((m) => m.id !== msg.id))
    const { data, error } = await supabase.from('messages').delete().eq('id', msg.id).select('id')

    if (error || !data?.length) {
      console.error('Could not delete message', error)
      setMessages((prev) =>
        [...prev, msg].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      )
      showToast("Couldn't delete that. Try again.")
      return
    }

    const path = storagePathFromUrl(msg.image_url)
    if (path) supabase.storage.from('chat-images').remove([path]).catch(() => {})
  }

  async function confirmClearChat() {
    setConfirmClear(false)
    setMenuOpen(false)
    const { error } = await supabase.from('messages').delete().eq('user_id', userId)
    if (error) {
      console.error('Could not clear chat', error)
      showToast("Couldn't clear the chat. Try again.")
      return
    }

    setMessages([])
    setHasMore(false)
    setReplyTo(null)
    localStorage.removeItem(CACHE_KEY)

    // Also frees the picture space in Supabase Storage (best effort).
    try {
      const { data: files } = await supabase.storage.from('chat-images').list(userId, { limit: 1000 })
      if (files?.length) {
        await supabase.storage.from('chat-images').remove(files.map((f) => `${userId}/${f.name}`))
      }
    } catch {
      // Not critical.
    }
    showToast('Chat cleared')
  }

  function dismissSoftAsk() {
    const count = Number(localStorage.getItem(SOFT_ASK_DISMISS_KEY) || 0) + 1
    localStorage.setItem(SOFT_ASK_DISMISS_KEY, String(count))
    setShowSoftAsk(false)
  }

  async function acceptSoftAsk() {
    setShowSoftAsk(false)
    await requestAndRegisterNotifications()
  }

  function dismissDeniedNotice() {
    localStorage.setItem(DENIED_NOTICE_SEEN_KEY, '1')
    setShowDeniedNotice(false)
  }

  async function handleLogout() {
    localStorage.removeItem(CACHE_KEY)
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

  // ---- what to show --------------------------------------------------------
  const visible = useMemo(() => {
    let list = messages
    if (starredOnly) list = list.filter((m) => m.starred)
    const q = query.trim().toLowerCase()
    if (q) list = list.filter((m) => (m.content || '').toLowerCase().includes(q))
    return list
  }, [messages, starredOnly, query])

  const rows = useMemo(
    () =>
      visible.map((m, i) => {
        const prev = visible[i - 1]
        const next = visible[i + 1]
        const gapBefore = prev ? new Date(m.created_at) - new Date(prev.created_at) : Infinity
        const gapAfter = next ? new Date(next.created_at) - new Date(m.created_at) : Infinity
        const showDate = !prev || !isSameDay(prev.created_at, m.created_at)
        return {
          m,
          showDate,
          startsGroup: showDate || prev.sender !== m.sender || gapBefore > GROUP_GAP_MS,
          endsGroup:
            !next || !isSameDay(m.created_at, next.created_at) || next.sender !== m.sender || gapAfter > GROUP_GAP_MS,
        }
      }),
    [visible]
  )

  const filtering = starredOnly || query.trim().length > 0
  const isEmpty = loadState === 'ready' && messages.length === 0

  return (
    <div className="app-screen flex flex-col overflow-hidden bg-white">
      <header className="flex items-center gap-3 bg-primary-dark px-3 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)] text-white">
        <button onClick={() => navigate('/')} aria-label="Back to chats">
          <BackArrowIcon className="h-5 w-5 text-white/90" />
        </button>

        <Avatar src={companionAvatar} alt="Companion" size="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">Companion</p>
          <p className="text-xs leading-tight text-sky-200/80">{sending ? 'typing…' : 'online'}</p>
        </div>

        <button
          onClick={() => {
            setSearchOpen((v) => !v)
            setQuery('')
          }}
          aria-label="Search in chat"
        >
          <SearchIcon className="h-5 w-5 text-white/90" />
        </button>

        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} aria-label="More options">
            <MoreVerticalIcon className="h-5 w-5 text-white/90" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 w-52 overflow-hidden rounded-lg bg-white text-sm text-slate-800 shadow-xl">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    navigate('/reminders')
                  }}
                  className="block w-full px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  Reminders
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    setStarredOnly((v) => !v)
                  }}
                  className="block w-full px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  {starredOnly ? 'Show all messages' : 'Starred messages'}
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    setVoiceSettingsOpen(true)
                  }}
                  className="block w-full px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  Voice settings
                </button>
                <button onClick={handleToggleMute} className="block w-full px-4 py-2.5 text-left hover:bg-slate-50">
                  {muted ? 'Unmute sounds' : 'Mute sounds'}
                </button>
                {notifPermission === 'granted' && pushSubscribed ? (
                  <div className="block w-full px-4 py-2.5 text-left text-slate-400">Notifications on</div>
                ) : (
                  <button
                    onClick={handleEnableNotifications}
                    className="block w-full px-4 py-2.5 text-left hover:bg-slate-50"
                  >
                    {notifPermission === 'granted' ? 'Retry notifications' : 'Enable notifications'}
                  </button>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    setConfirmClear(true)
                  }}
                  className="block w-full px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  Clear chat
                </button>
                <button
                  onClick={handleLogout}
                  className="block w-full px-4 py-2.5 text-left text-red-600 hover:bg-slate-50"
                >
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {searchOpen && (
        <div className="fade-in flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <SearchIcon className="h-4 w-4 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this chat"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
          />
          <button
            onClick={() => {
              setSearchOpen(false)
              setQuery('')
            }}
            aria-label="Close search"
          >
            <XIcon className="h-4 w-4 text-slate-500" />
          </button>
        </div>
      )}

      {starredOnly && (
        <div className="flex items-center justify-between bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
          <span>Showing starred messages</span>
          <button onClick={() => setStarredOnly(false)} className="font-medium text-amber-700">
            Show all
          </button>
        </div>
      )}

      {showSoftAsk && (
        <div className="mx-3 mt-2 flex items-center justify-between rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <span>Want a text the moment this is due?</span>
          <div className="flex gap-3">
            <button onClick={dismissSoftAsk} className="text-slate-500">
              Not now
            </button>
            <button onClick={acceptSoftAsk} className="font-medium text-primary">
              Turn on
            </button>
          </div>
        </div>
      )}

      {showDeniedNotice && (
        <div className="mx-3 mt-2 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>Notifications are off — enable them in your browser's site settings to get reminder texts.</span>
          <button onClick={dismissDeniedNotice} className="font-medium text-amber-700">
            Got it
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <main ref={scrollRef} onScroll={handleScroll} className="chat-surface h-full overflow-y-auto px-3 pb-4 pt-2">
          <div className="mx-auto max-w-3xl">
            {hasMore && !filtering && (
              <div className="flex justify-center py-2">
                <button
                  onClick={loadOlder}
                  disabled={loadingMore}
                  className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-slate-500 shadow-sm hover:text-slate-700"
                >
                  {loadingMore ? 'Loading…' : 'Load earlier messages'}
                </button>
              </div>
            )}

            {loadState === 'loading' && messages.length === 0 && (
              <div className="space-y-4 pt-6">
                <div className="skeleton h-4 w-2/3 rounded-full" />
                <div className="skeleton ml-auto h-9 w-1/2 rounded-2xl" />
                <div className="skeleton h-4 w-3/4 rounded-full" />
              </div>
            )}

            {loadState === 'error' && messages.length === 0 && (
              <div className="pt-16 text-center text-sm text-slate-500">
                <p>Couldn't load your messages.</p>
                <button
                  onClick={() => {
                    setLoadState('loading')
                    loadMessages(userId)
                  }}
                  className="mt-2 font-medium text-primary"
                >
                  Try again
                </button>
              </div>
            )}

            {isEmpty && (
              <div className="fade-in flex flex-col items-center px-4 pb-6 pt-10 text-center">
                <img src={companionAvatar} alt="" className="h-20 w-20 rounded-full object-cover shadow-md" />
                <h2 className="mt-4 text-xl font-semibold text-slate-900">Hi, I'm your Companion</h2>
                <p className="mt-1 max-w-xs text-sm text-slate-500">
                  I set reminders, draw pictures, and chat about anything. Try one of these:
                </p>
                <div className="mt-5 grid w-full max-w-sm gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.text}
                      onClick={() => sendMessage(s.text)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 shadow-sm transition hover:border-primary/50 active:scale-[0.99]"
                    >
                      <span className="mr-2">{s.icon}</span>
                      {s.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filtering && visible.length === 0 && (
              <p className="pt-16 text-center text-sm text-slate-400">
                {starredOnly && !query.trim() ? 'No starred messages yet.' : 'No messages found.'}
              </p>
            )}

            {rows.map(({ m, showDate, startsGroup, endsGroup }) => (
              <Fragment key={m._key ?? m.id}>
                {showDate && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-slate-200/70 px-3 py-0.5 text-[11px] font-medium text-slate-500">
                      {dayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  msg={m}
                  startsGroup={startsGroup}
                  endsGroup={endsGroup}
                  flash={flashId === m.id}
                  onOpenActions={openActions}
                  onReply={startReply}
                  onRetry={retrySend}
                  onJump={jumpTo}
                  onOpenImage={openImage}
                  onSpeak={speakMessage}
                  speaking={speakingId === m.id}
                />
              </Fragment>
            ))}

            {sending && (
              <div className="fade-in mt-4 flex items-center gap-2.5">
                <img src={companionAvatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                <div className="flex items-center gap-1 rounded-2xl bg-white px-3 py-2.5 shadow-sm">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                </div>
              </div>
            )}
          </div>
        </main>

        {!atBottom && (
          <button
            onClick={scrollToBottom}
            aria-label="Scroll to latest message"
            className="fade-in absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-lg ring-1 ring-slate-200 hover:text-slate-900"
          >
            <ChevronDownIcon className="h-5 w-5" />
            {unseen > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white">
                {unseen}
              </span>
            )}
          </button>
        )}
      </div>

      <Composer
        ref={composerRef}
        onSend={submitFromComposer}
        busy={sending}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        voicePrefs={voicePrefs}
        onVoiceError={showToast}
      />

      {toast && (
        <div className="fade-in pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
          <div className="rounded-full bg-slate-900/90 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
        </div>
      )}

      {sheetMsg && (
        <MessageSheet
          msg={sheetMsg}
          onClose={() => setSheetMsg(null)}
          onReply={startReply}
          onCopy={handleCopy}
          onReact={handleReact}
          onStar={handleStar}
          onShare={handleShare}
          onSaveImage={handleSaveImage}
          onDelete={askDelete}
          speaking={speakingId === sheetMsg.id}
          onSpeak={(m) => {
            setSheetMsg(null)
            speakMessage(m)
          }}
        />
      )}

      {voiceSettingsOpen && (
        <VoiceSettings
          prefs={voicePrefs}
          onChange={handleVoicePrefsChange}
          onClose={() => setVoiceSettingsOpen(false)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this message?"
          body="It will be removed from your chat for good."
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Clear the whole chat?"
          body="All messages and pictures will be deleted. Your reminders stay."
          confirmLabel="Clear chat"
          onConfirm={confirmClearChat}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90" role="dialog" aria-modal="true">
          <div className="fade-in absolute inset-0" onClick={() => setLightbox(null)} />
          <img src={lightbox} alt="Picture" className="relative max-h-[85dvh] max-w-full rounded-lg object-contain" />
          <div className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] flex gap-2">
            <button
              onClick={() => saveImage(lightbox)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              aria-label="Save picture"
            >
              <DownloadIcon className="h-5 w-5" />
            </button>
            <button
              onClick={() => setLightbox(null)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              aria-label="Close"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}