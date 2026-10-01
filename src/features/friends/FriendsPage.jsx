import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useFriends } from '../../lib/useFriends'
import Avatar from '../../components/Avatar'
import { BackArrowIcon, SearchIcon } from '../../components/Icons'
import { useComingSoonToast } from '../../components/ComingSoonToast'

const PAGE_SIZE = 20
const primaryBtn = 'shrink-0 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-white'
const quietBtn = 'shrink-0 rounded-full bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-600'

function PersonRow({ person, onClick, children }) {
  const name = person?.username ?? 'unknown'
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 border-b border-slate-100 px-4 py-3 ${onClick ? 'cursor-pointer hover:bg-slate-50' : ''}`}
    >
      <Avatar src={person?.avatar_url} label={name[0].toUpperCase()} alt={name} />
      <p className="min-w-0 flex-1 truncate font-medium text-slate-900">@{name}</p>
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </p>
  )
}

export default function FriendsPage() {
  const navigate = useNavigate()
  const { myId, friends, incoming, outgoing, reload } = useFriends()
  const [tab, setTab] = useState('people') // 'people' | 'friends'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [people, setPeople] = useState([])
  const [peopleState, setPeopleState] = useState('loading') // 'loading' | 'ready' | 'error'
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [toast, showToast] = useComingSoonToast()

  // ---- the browsable people list ---------------------------------------------
  const fetchPeoplePage = useCallback(async (after) => {
    const { data, error } = await supabase.rpc('get_people_to_add', {
      page_size: PAGE_SIZE,
      before_created_at: after?.created_at ?? null,
      before_id: after?.id ?? null,
    })
    return error ? null : data
  }, [])

  const refreshPeople = useCallback(async () => {
    setPeopleState('loading')
    const rows = await fetchPeoplePage(null)
    if (!rows) {
      setPeopleState('error')
      return
    }
    setPeople(rows)
    setHasMore(rows.length === PAGE_SIZE)
    setPeopleState('ready')
  }, [fetchPeoplePage])

  useEffect(() => {
    if (myId) refreshPeople()
  }, [myId, refreshPeople])

  async function loadMore() {
    if (loadingMore || people.length === 0) return
    setLoadingMore(true)
    const rows = await fetchPeoplePage(people[people.length - 1])
    setLoadingMore(false)
    if (!rows) {
      showToast("Couldn't load more")
      return
    }
    setPeople((prev) => [...prev, ...rows])
    setHasMore(rows.length === PAGE_SIZE)
  }

  // ---- optional search (filters by username) ---------------------------------
  useEffect(() => {
    const q = query.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (q.length < 2 || !myId) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .ilike('username', q.replace(/_/g, '\\_') + '%')
        .neq('id', myId)
        .limit(20)
      setResults(data ?? [])
    }, 300)
    return () => clearTimeout(timer)
  }, [query, myId])

  // ---- actions -----------------------------------------------------------------
  async function sendRequest(targetId) {
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: myId, addressee_id: targetId })
    if (error) showToast(error.code === '23505' ? 'Already requested' : "Couldn't send request")
    reload()
  }

  async function accept(id) {
    const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id)
    if (error) showToast("Couldn't accept - try again")
    reload()
  }

  async function remove(id) {
    const { error } = await supabase.from('friendships').delete().eq('id', id)
    if (error) showToast("Couldn't do that - try again")
    reload()
  }

  // What button should this person show? (used by both the list and search results)
  function actionFor(person) {
    if (friends.some((f) => f.other?.id === person.id)) {
      return <span className="text-sm text-slate-400">Friends</span>
    }
    if (outgoing.some((f) => f.other?.id === person.id)) {
      return <span className="text-sm text-slate-400">Requested</span>
    }
    const received = incoming.find((f) => f.other?.id === person.id)
    if (received) {
      return <button onClick={() => accept(received.id)} className={primaryBtn}>Accept</button>
    }
    return <button onClick={() => sendRequest(person.id)} className={primaryBtn}>Add</button>
  }

  // ---- tab contents ------------------------------------------------------------
  function renderPeopleTab() {
    if (query.trim().length >= 2) {
      if (results.length === 0) return <p className="p-6 text-center text-sm text-slate-400">No one found.</p>
      return results.map((p) => <PersonRow key={p.id} person={p}>{actionFor(p)}</PersonRow>)
    }

    if (peopleState === 'loading') {
      return <p className="p-6 text-center text-sm text-slate-400">Loading...</p>
    }
    if (peopleState === 'error') {
      return (
        <div className="p-6 text-center">
          <p className="text-sm text-amber-700">Couldn&apos;t load people - check your connection</p>
          <button onClick={refreshPeople} className={`${primaryBtn} mt-3`}>Try again</button>
        </div>
      )
    }
    if (people.length === 0) {
      return (
        <p className="p-6 text-center text-sm text-slate-400">
          No one to add right now. As more people join, they&apos;ll show up here.
        </p>
      )
    }

    return (
      <>
        {people.map((p) => (
          <PersonRow key={p.id} person={p}>{actionFor(p)}</PersonRow>
        ))}
        {hasMore && (
          <div className="p-4 text-center">
            <button onClick={loadMore} disabled={loadingMore} className={`${quietBtn} disabled:opacity-50`}>
              {loadingMore ? 'Loading...' : 'Show more'}
            </button>
          </div>
        )}
      </>
    )
  }

  function renderFriendsTab() {
    return (
      <>
        {incoming.length > 0 && (
          <>
            <SectionLabel>Requests</SectionLabel>
            {incoming.map((r) => (
              <PersonRow key={r.id} person={r.other}>
                <button onClick={() => remove(r.id)} className={quietBtn}>Decline</button>
                <button onClick={() => accept(r.id)} className={primaryBtn}>Accept</button>
              </PersonRow>
            ))}
          </>
        )}

        <SectionLabel>Your friends</SectionLabel>
        {friends.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-400">
            No friends yet - open &quot;Add people&quot; to find someone.
          </p>
        ) : (
          friends.map((r) => (
            <PersonRow key={r.id} person={r.other} onClick={() => navigate(`/dm/${r.other.id}`)}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.confirm(`Remove @${r.other?.username ?? 'this person'} from your friends?`)) remove(r.id)
                }}
                className={quietBtn}
              >
                Remove
              </button>
            </PersonRow>
          ))
        )}

        {outgoing.length > 0 && (
          <>
            <SectionLabel>Sent</SectionLabel>
            {outgoing.map((r) => (
              <PersonRow key={r.id} person={r.other}>
                <button onClick={() => remove(r.id)} className={quietBtn}>Cancel</button>
              </PersonRow>
            ))}
          </>
        )}
      </>
    )
  }

  const tabClass = (name) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition ${
      tab === name ? 'bg-primary text-white' : 'bg-white/10 text-white/70'
    }`

  return (
    <div className="app-screen flex flex-col bg-white">
      <header className="bg-primary-dark pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-white">
        <div className="flex items-center gap-3 px-4">
          <button onClick={() => navigate('/')} aria-label="Back">
            <BackArrowIcon className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-semibold">Friends</h1>
        </div>

        <div className="mx-4 mt-3 flex gap-2">
          <button onClick={() => setTab('people')} className={tabClass('people')}>Add people</button>
          <button onClick={() => setTab('friends')} className={tabClass('friends')}>
            Friends
            {incoming.length > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
                {incoming.length}
              </span>
            )}
          </button>
        </div>

        {tab === 'people' && (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-white/60 focus-within:bg-white/15">
            <SearchIcon className="h-4 w-4 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username (optional)"
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/60 focus:outline-none"
            />
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        {tab === 'people' ? renderPeopleTab() : renderFriendsTab()}
      </main>

      {toast}
    </div>
  )
}