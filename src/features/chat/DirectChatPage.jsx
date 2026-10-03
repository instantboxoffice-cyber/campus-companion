import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { sounds } from '../../lib/sounds'
import { DM_READ_EVENT } from '../../lib/useConversations'
import { copyToClipboard, dayLabel, isSameDay } from '../../lib/messageUtils'
import { dmPreview, downloadDmFile, removeDmFile, uploadDmFile } from '../../lib/dmMedia'
import Avatar from '../../components/Avatar'
import { BackArrowIcon, XIcon } from '../../components/Icons'
import { ArrowDownIcon, DownloadIcon } from '../../components/ChatIcons'
import { useComingSoonToast } from '../../components/ComingSoonToast'
import ConfirmDialog from './ConfirmDialog'
import DmComposer from './DmComposer'
import DmMessageBubble from './DmMessageBubble'
import DmMessageSheet from './DmMessageSheet'
import './chat.css'

const PAGE_SIZE = 60
const NEAR_BOTTOM_PX = 140
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const byTime = (a, b) => new Date(a.created_at) - new Date(b.created_at)

function audioFileName(type = '') {
  if (type.includes('wav')) return 'voice-note.wav'
  if (type.includes('mp4')) return 'voice-note.m4a'
  if (type.includes('ogg')) return 'voice-note.ogg'
  return 'voice-note.webm'
}

function loadHidden(userId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(`cc_dm_hidden_${userId}`) || '[]'))
  } catch {
    return new Set()
  }
}

export default function DirectChatPage() {
  const { friendId } = useParams()
  const navigate = useNavigate()
  const [toast, showToast] = useComingSoonToast()
  const [myId, setMyId] = useState(null)
  const [other, setOther] = useState(undefined) // undefined = loading, null = not found
  const [messages, setMessages] = useState([])
  const [loadState, setLoadState] = useState('loading')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hidden, setHidden] = useState(() => new Set())
  const [replyTo, setReplyTo] = useState(null) // { msg, mine }
  const [actionsMsg, setActionsMsg] = useState(null)
  const [confirmMsg, setConfirmMsg] = useState(null)
  const [viewer, setViewer] = useState(null) // { msg, url }
  const [flashId, setFlashId] = useState(null)
  const [showJump, setShowJump] = useState(false)
  const [unseen, setUnseen] = useState(0)

  const mainRef = useRef(null)
  const bottomRef = useRef(null)
  const nearBottomRef = useRef(true)
  const firstScrollRef = useRef(true)
  const lastSeenIdRef = useRef(null)
  const pendingRef = useRef(new Map()) // tempId -> what to resend if it fails
  const objectUrlsRef = useRef(new Set())
  const toastRef = useRef(showToast)
  const validId = UUID_RE.test(friendId ?? '')

  useEffect(() => {
    toastRef.current = showToast
  })

  // Free the local previews when leaving the chat.
  useEffect(() => {
    const urls = objectUrlsRef.current
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  useEffect(() => {
    if (!validId) return
    supabase.auth.getSession().then(({ data: { session } }) => {
      const id = session?.user?.id ?? null
      setMyId(id)
      if (id) setHidden(loadHidden(id))
    })
    supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .eq('id', friendId)
      .maybeSingle()
      .then(({ data }) => setOther(data ?? null))
  }, [friendId, validId])

  // Marks this friend's messages as read, then tells the chat list so its
  // badge and highlight clear right away (even if you have already left).
  const markRead = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    const { error } = await supabase.rpc('mark_dms_read', { other_id: friendId })
    if (!error) window.dispatchEvent(new CustomEvent(DM_READ_EVENT, { detail: { friendId } }))
  }, [friendId])

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`sender_id.eq.${friendId},recipient_id.eq.${friendId}`)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (error) {
      setLoadState((s) => (s === 'ready' ? s : 'error'))
      return
    }
    const rows = data.reverse()
    const full = rows.length === PAGE_SIZE
    const oldest = rows[0]?.created_at
    setHasMore((prev) => prev || full)

    setMessages((prev) => {
      const map = new Map()
      // Keep older pages already loaded; the server copy replaces the newest page.
      prev.forEach((m) => {
        if (m._sending || m._failed) return
        if (full && oldest && m.created_at < oldest) map.set(m.id, m)
      })
      rows.forEach((r) => map.set(r.id, { ...(prev.find((m) => m.id === r.id) ?? {}), ...r }))
      return [...[...map.values()].sort(byTime), ...prev.filter((m) => m._sending || m._failed)]
    })
    setLoadState('ready')
    markRead()
  }, [friendId, markRead])

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((m) => !m._sending && !m._failed)
    if (!oldest || loadingMore) return
    setLoadingMore(true)
    const el = mainRef.current
    const before = el?.scrollHeight ?? 0

    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`sender_id.eq.${friendId},recipient_id.eq.${friendId}`)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    setLoadingMore(false)
    if (error) {
      toastRef.current("Couldn't load earlier messages")
      return
    }
    setHasMore(data.length === PAGE_SIZE)
    nearBottomRef.current = false
    setMessages((prev) => {
      const have = new Set(prev.map((m) => m.id))
      const older = data.filter((r) => !have.has(r.id)).reverse()
      return [...older, ...prev]
    })
    // Keep the screen where it was instead of jumping to the top.
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - before
    })
  }, [messages, loadingMore, friendId])

  useEffect(() => {
    if (!myId || !validId) return

    const channel = supabase
      .channel(`dm-thread-${friendId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (payload) => {
        const row = payload.new
        const inThisChat =
          (row.sender_id === friendId && row.recipient_id === myId) ||
          (row.sender_id === myId && row.recipient_id === friendId)
        if (!inThisChat) return
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, _fresh: true }]))
        if (row.sender_id === friendId) {
          sounds.received()
          markRead()
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages' }, (payload) => {
        setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m)))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'direct_messages' }, (payload) => {
        const id = payload.old?.id
        if (id) setMessages((prev) => prev.filter((m) => m.id !== id))
      })
      // Also re-syncs after any reconnect, so nothing is missed while offline
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') loadMessages()
      })

    const onVisible = () => markRead()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
      markRead() // final sweep on the way out
    }
  }, [myId, friendId, validId, loadMessages, markRead])

  const visibleMessages = useMemo(() => messages.filter((m) => !hidden.has(m.id)), [messages, hidden])
  const messageById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages])

  // ---- scrolling -----------------------------------------------------------
  function handleScroll() {
    const el = mainRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    nearBottomRef.current = near
    setShowJump(!near)
    if (near) setUnseen(0)
  }

  function scrollToBottom(smooth = true) {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' })
    setUnseen(0)
  }

  // Follow new messages when you're at the bottom (or when you sent them);
  // otherwise show a "new messages" button instead of yanking the screen.
  useEffect(() => {
    const last = visibleMessages[visibleMessages.length - 1]
    if (!last) return
    if (firstScrollRef.current) {
      firstScrollRef.current = false
      lastSeenIdRef.current = last.id
      requestAnimationFrame(() => scrollToBottom(false))
      return
    }
    if (lastSeenIdRef.current === last.id) return
    lastSeenIdRef.current = last.id
    if (last.sender_id === myId || nearBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom(true))
    } else {
      setUnseen((n) => n + 1)
    }
  }, [visibleMessages, myId])

  // Pictures finish loading after the first scroll; stay pinned to the bottom if we were there.
  useEffect(() => {
    const el = mainRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const inner = el.firstElementChild
    if (!inner) return undefined
    const ro = new ResizeObserver(() => {
      if (nearBottomRef.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [loadState])

  // ---- sending -------------------------------------------------------------
  const deliver = useCallback(
    async (job, retryOfId) => {
      if (!myId) return
      const tempId = crypto.randomUUID()
      const { content = '', file = null, type = null, seconds = null, reply = null } = job
      let localUrl = job.localUrl ?? null
      if (file && !localUrl && (type === 'image' || type === 'audio')) {
        localUrl = URL.createObjectURL(file)
        objectUrlsRef.current.add(localUrl)
      }

      const optimistic = {
        id: tempId,
        _key: job.key || tempId,
        sender_id: myId,
        recipient_id: friendId,
        content,
        created_at: new Date().toISOString(),
        read_at: null,
        attachment_type: type,
        attachment_name: file ? file.name || null : null,
        attachment_size: file ? file.size : null,
        attachment_mime: file ? file.type || null : null,
        audio_seconds: seconds,
        reply_to_id: reply?.id ?? null,
        reply_preview: reply?.preview ?? null,
        _localUrl: localUrl,
        _sending: true,
        _fresh: true,
      }
      pendingRef.current.set(tempId, { ...job, localUrl, key: optimistic._key, path: job.path ?? null })
      setMessages((prev) => [...prev.filter((m) => m.id !== retryOfId), optimistic])
      sounds.sent()

      let path = job.path ?? null
      let failure = null
      let data = null

      try {
        if (file && !path) {
          path = await uploadDmFile(file, myId)
          pendingRef.current.set(tempId, { ...job, localUrl, key: optimistic._key, path })
        }
        const row = {
          sender_id: myId,
          recipient_id: friendId,
          content,
          reply_to_id: reply?.id ?? null,
          reply_preview: reply?.preview ?? null,
        }
        if (file) {
          Object.assign(row, {
            attachment_path: path,
            attachment_type: type,
            attachment_name: optimistic.attachment_name,
            attachment_size: optimistic.attachment_size,
            attachment_mime: optimistic.attachment_mime,
            audio_seconds: seconds,
          })
        }
        const res = await supabase.from('direct_messages').insert(row).select().single()
        if (res.error) failure = res.error
        else data = res.data
      } catch (err) {
        failure = err
      }

      if (failure) {
        // 42501 = the database refused it, i.e. you're not friends (any more)
        if (failure.code === '42501') {
          pendingRef.current.delete(tempId)
          if (path) removeDmFile(path)
          setMessages((prev) => prev.filter((m) => m.id !== tempId))
          toastRef.current('You can only message friends')
        } else {
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _sending: false, _failed: true } : m)))
          if (failure.message && !failure.code) toastRef.current(failure.message)
        }
        return
      }

      pendingRef.current.delete(tempId)
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== tempId)
        // The live event may already have added the real row; fill in the local preview.
        if (without.some((m) => m.id === data.id)) {
          return without.map((m) => (m.id === data.id ? { ...m, _key: optimistic._key, _localUrl: localUrl } : m))
        }
        return [...without, { ...data, _key: optimistic._key, _localUrl: localUrl }]
      })
    },
    [myId, friendId]
  )

  const consumeReply = useCallback(() => {
    const reply =
      replyTo && !replyTo.msg._sending && !replyTo.msg._failed
        ? { id: replyTo.msg.id, preview: dmPreview(replyTo.msg) }
        : null
    setReplyTo(null)
    return reply
  }, [replyTo])

  const sendText = useCallback((text) => deliver({ content: text, reply: consumeReply() }), [deliver, consumeReply])

  const sendFiles = useCallback(
    (items, caption) => {
      const reply = consumeReply()
      items.forEach((item, i) =>
        deliver({
          file: item.file,
          type: item.type,
          content: i === 0 ? caption : '',
          reply: i === 0 ? reply : null,
        })
      )
    },
    [deliver, consumeReply]
  )

  const sendVoice = useCallback(
    ({ blob, seconds }) => {
      const file = new File([blob], audioFileName(blob.type), { type: blob.type || 'audio/wav' })
      deliver({ file, type: 'audio', seconds, reply: consumeReply() })
    },
    [deliver, consumeReply]
  )

  const retry = useCallback(
    (msg) => {
      const job = pendingRef.current.get(msg.id)
      pendingRef.current.delete(msg.id)
      if (job) deliver(job, msg.id)
      else setMessages((prev) => prev.filter((m) => m.id !== msg.id))
    },
    [deliver]
  )

  // ---- message actions -----------------------------------------------------
  const openActions = useCallback((msg) => setActionsMsg(msg), [])

  const startReply = useCallback(
    (msg) => {
      if (msg._sending || msg._failed) return
      setReplyTo({ msg, mine: msg.sender_id === myId })
      setActionsMsg(null)
    },
    [myId]
  )

  const jumpTo = useCallback((id) => {
    const el = document.getElementById(`dm-${id}`)
    if (!el) {
      toastRef.current("That message isn't loaded")
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashId(id)
    setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1500)
  }, [])

  const openImage = useCallback((msg, url) => setViewer({ msg, url }), [])

  const openFile = useCallback(async (msg) => {
    if (msg._sending || !msg.attachment_path) return
    await downloadDmFile(msg.attachment_path, msg.attachment_name)
  }, [])

  async function copyMessage(msg) {
    setActionsMsg(null)
    const ok = await copyToClipboard(msg.content)
    showToast(ok ? 'Copied' : "Couldn't copy")
  }

  async function saveMessage(msg) {
    setActionsMsg(null)
    const fallback = msg.attachment_type === 'audio' ? 'voice-note.wav' : 'photo.jpg'
    await downloadDmFile(msg.attachment_path, msg.attachment_name || fallback)
  }

  function deleteForMe(msg) {
    setActionsMsg(null)
    if (msg._failed) {
      pendingRef.current.delete(msg.id)
      setMessages((prev) => prev.filter((m) => m.id !== msg.id))
      return
    }
    const next = new Set(hidden)
    next.add(msg.id)
    setHidden(next)
    try {
      localStorage.setItem(`cc_dm_hidden_${myId}`, JSON.stringify([...next].slice(-2000)))
    } catch {
      // not critical
    }
  }

  async function deleteForEveryone() {
    const msg = confirmMsg
    setConfirmMsg(null)
    if (!msg) return
    const { data, error } = await supabase.from('direct_messages').delete().eq('id', msg.id).select('id')
    if (error || !data?.length) {
      showToast("Couldn't delete. Try again")
      return
    }
    removeDmFile(msg.attachment_path)
    setMessages((prev) => prev.filter((m) => m.id !== msg.id))
    if (replyTo?.msg.id === msg.id) setReplyTo(null)
  }

  // ---- render --------------------------------------------------------------
  if (!validId || other === null) {
    return (
      <div className="app-screen flex flex-col items-center justify-center gap-3 bg-white p-6 text-center">
        <p className="text-slate-500">This person isn&apos;t available.</p>
        <button onClick={() => navigate('/')} className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white">
          Back to chats
        </button>
      </div>
    )
  }

  const name = other?.username ?? ''

  return (
    <div className="app-screen flex flex-col bg-white">
      <header className="flex items-center gap-3 bg-primary-dark px-3 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
        <button
          onClick={() => {
            markRead()
            navigate('/')
          }}
          aria-label="Back"
        >
          <BackArrowIcon className="h-5 w-5" />
        </button>
        <Avatar src={other?.avatar_url} label={(name[0] ?? '?').toUpperCase()} alt={name} size="sm" />
        <p className="min-w-0 flex-1 truncate font-medium">{name ? `@${name}` : ''}</p>
      </header>

      <div className="relative min-h-0 flex-1">
        <main ref={mainRef} onScroll={handleScroll} className="chat-wallpaper absolute inset-0 overflow-y-auto px-3 py-3">
          <div>
            {loadState === 'error' && (
              <p className="py-6 text-center text-sm text-amber-700">Couldn&apos;t load messages - check your connection</p>
            )}
            {loadState === 'loading' && (
              <div className="space-y-3 py-4" aria-hidden="true">
                <div className="skeleton h-10 w-40 rounded-2xl" />
                <div className="skeleton ml-auto h-10 w-52 rounded-2xl" />
                <div className="skeleton h-10 w-56 rounded-2xl" />
              </div>
            )}
            {loadState === 'ready' && visibleMessages.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">No messages yet. Say hi{name ? ` to @${name}` : ''}.</p>
            )}

            {hasMore && loadState === 'ready' && (
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  onClick={loadOlder}
                  disabled={loadingMore}
                  className="rounded-full bg-white/90 px-4 py-1.5 text-xs font-medium text-primary shadow-sm disabled:opacity-60"
                >
                  {loadingMore ? 'Loading…' : 'Load earlier messages'}
                </button>
              </div>
            )}

            {visibleMessages.map((msg, i) => {
              const mine = msg.sender_id === myId
              const prev = visibleMessages[i - 1]
              const newDay = !prev || !isSameDay(prev.created_at, msg.created_at)
              const startsGroup = newDay || prev.sender_id !== msg.sender_id

              let replyAuthor = 'Message'
              if (msg.reply_preview) {
                const original = messageById.get(msg.reply_to_id)
                if (original) replyAuthor = original.sender_id === myId ? 'You' : `@${name}`
              }

              return (
                <div key={msg._key || msg.id}>
                  {newDay && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full bg-white/80 px-3 py-1 text-xs text-slate-500 shadow-sm">
                        {dayLabel(msg.created_at)}
                      </span>
                    </div>
                  )}
                  <DmMessageBubble
                    msg={msg}
                    mine={mine}
                    startsGroup={startsGroup}
                    flash={flashId === msg.id}
                    replyAuthor={replyAuthor}
                    onOpenActions={openActions}
                    onReply={startReply}
                    onRetry={retry}
                    onJump={jumpTo}
                    onOpenImage={openImage}
                    onOpenFile={openFile}
                  />
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        </main>

        {showJump && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            aria-label="Jump to latest message"
            className="fade-in absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-lg ring-1 ring-slate-200"
          >
            <ArrowDownIcon className="h-5 w-5" />
            {unseen > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white">
                {unseen > 99 ? '99+' : unseen}
              </span>
            )}
          </button>
        )}
      </div>

      <DmComposer
        onSendText={sendText}
        onSendFiles={sendFiles}
        onSendVoice={sendVoice}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onError={(text) => showToast(text)}
        friendName={name}
      />

      {actionsMsg && (
        <DmMessageSheet
          msg={actionsMsg}
          mine={actionsMsg.sender_id === myId}
          onClose={() => setActionsMsg(null)}
          onReply={startReply}
          onCopy={copyMessage}
          onSave={saveMessage}
          onDeleteForMe={deleteForMe}
          onDeleteForEveryone={(msg) => {
            setActionsMsg(null)
            setConfirmMsg(msg)
          }}
        />
      )}

      {confirmMsg && (
        <ConfirmDialog
          title="Delete for everyone?"
          body={`This removes the message for you and @${name}. It can't be undone.`}
          confirmLabel="Delete"
          onConfirm={deleteForEveryone}
          onCancel={() => setConfirmMsg(null)}
        />
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true">
          <header className="flex items-center gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white">
            <button type="button" onClick={() => setViewer(null)} aria-label="Close" className="rounded-full p-2 hover:bg-white/10">
              <XIcon className="h-5 w-5" />
            </button>
            <span className="flex-1" />
            {viewer.msg.attachment_path && (
              <button
                type="button"
                onClick={() => downloadDmFile(viewer.msg.attachment_path, viewer.msg.attachment_name || 'photo.jpg')}
                aria-label="Save photo"
                className="rounded-full p-2 hover:bg-white/10"
              >
                <DownloadIcon className="h-5 w-5" />
              </button>
            )}
          </header>
          <div className="flex min-h-0 flex-1 items-center justify-center p-2" onClick={() => setViewer(null)}>
            <img src={viewer.url} alt="" className="max-h-full max-w-full object-contain" />
          </div>
          {viewer.msg.content && (
            <p className="px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 text-center text-sm text-white/90">{viewer.msg.content}</p>
          )}
        </div>
      )}

      {toast}
    </div>
  )
}
