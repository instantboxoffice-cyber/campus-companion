import BottomNav from '../../components/BottomNav'
import ReelsFeed from './ReelsFeed'

export default function UpdatesPage() {
  return (
    <div className="app-screen flex flex-col bg-black">
      {/* The feed fills the whole space above the bottom bar, like Instagram Reels.
          The "Updates" title floats on top of the video inside ReelsFeed. */}
      <main className="relative min-h-0 flex-1">
        <ReelsFeed />
      </main>

      <BottomNav active="updates" />
    </div>
  )
}
