import companionAvatar from '../assets/companion-avatar.png'

export default function ComingSoon({ title, description }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-28 w-28 rounded-full bg-primary/25 blur-2xl" />
        <img
          src={companionAvatar}
          alt=""
          className="relative h-20 w-20 rounded-full shadow-lg shadow-primary/30"
        />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="max-w-xs text-sm text-slate-500">{description}</p>
      <span className="mt-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
        Coming soon
      </span>
    </div>
  )
}