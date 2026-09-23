import BottomNav from '../../components/BottomNav'
import ComingSoon from '../../components/ComingSoon'

export default function UpdatesPage() {
  return (
    <div className="app-screen flex flex-col bg-white">
      <header className="bg-primary-dark px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-white">
        <h1 className="text-2xl font-semibold">Updates</h1>
      </header>

      <main className="flex flex-1 flex-col overflow-y-auto">
        <ComingSoon
          title="Updates are on the way"
          description="Status-style updates from Companion - campus news, deadline heads-ups, and more - will show up here."
        />
      </main>

      <BottomNav active="updates" />
    </div>
  )
}