import BottomNav from '../../components/BottomNav'
import ReelsFeed from './ReelsFeed'

export default function UpdatesPage() {
  return (
    <div className="app-screen flex flex-col bg-black">
      <header className="bg-primary-dark px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-white">
        <h1 className="text-2xl font-semibold">Updates</h1>
      </header>

      <main className="min-h-0 flex-1">
        <ReelsFeed />
      </main>

      <BottomNav active="updates" />
    </div>
  )
}