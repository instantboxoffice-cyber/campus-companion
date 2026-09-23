import BottomNav from '../../components/BottomNav'
import ComingSoon from '../../components/ComingSoon'

export default function CallsPage() {
  return (
    <div className="app-screen flex flex-col bg-white">
      <header className="bg-primary-dark px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-white">
        <h1 className="text-2xl font-semibold">Calls</h1>
      </header>

      <main className="flex flex-1 flex-col overflow-y-auto">
        <ComingSoon
          title="Voice is coming soon"
          description="Talking to Companion out loud, and call-style reminders, will live here."
        />
      </main>

      <BottomNav active="calls" />
    </div>
  )
}