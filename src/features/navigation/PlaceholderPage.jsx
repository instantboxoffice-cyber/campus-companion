import { useLocation, useNavigate } from 'react-router-dom'
import BottomNav from '../../components/BottomNav'
import { CallsIcon, CommunitiesIcon, UpdatesIcon } from '../../components/Icons'

const tabDetails = {
  updates: { title: 'Updates', description: 'Status updates and channels will appear here.', Icon: UpdatesIcon },
  communities: { title: 'Communities', description: 'Your communities will appear here.', Icon: CommunitiesIcon },
  calls: { title: 'Calls', description: 'Your calls will appear here.', Icon: CallsIcon },
}

export default function PlaceholderPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const tab = pathname.slice(1)
  const details = tabDetails[tab] ?? tabDetails.updates
  const { Icon } = details

  return (
    <div className="app-screen flex flex-col bg-slate-950 text-white">
      <header className="bg-slate-900 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <h1 className="text-2xl font-semibold">{details.title}</h1>
      </header>
      <main className="min-h-0 flex flex-1 flex-col items-center justify-center overflow-hidden px-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/15 text-sky-400">
          <Icon className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-semibold">Coming soon</h2>
        <p className="mt-2 max-w-xs text-sm text-slate-400">{details.description}</p>
        <button
          onClick={() => navigate('/')}
          className="mt-6 rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
        >
          Back to chats
        </button>
      </main>
      <BottomNav />
    </div>
  )
}
