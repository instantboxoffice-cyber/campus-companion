export default function CampusCompanionIcon({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="companion-face" x1="5" y1="5" x2="27" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FDE68A" />
          <stop offset=".45" stopColor="#F9A8D4" />
          <stop offset="1" stopColor="#A78BFA" />
        </linearGradient>
        <linearGradient id="companion-spark" x1="9" y1="2" x2="24" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#67E8F9" />
          <stop offset="1" stopColor="#818CF8" />
        </linearGradient>
      </defs>
      <path d="M16 2.5l1.8 4.2 4.4.4-3.3 2.9 1 4.3-3.9-2.3-3.9 2.3 1-4.3-3.3-2.9 4.4-.4L16 2.5z" fill="url(#companion-spark)" />
      <rect x="6" y="11" width="20" height="16" rx="8" fill="url(#companion-face)" />
      <path d="M6.5 17.5C4.8 16.8 4 15.5 4 14c0-1.1.9-2 2-2h1M25.5 17.5c1.7-.7 2.5-2 2.5-3.5 0-1.1-.9-2-2-2h-1" stroke="#67E8F9" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="18" r="1.7" fill="#4C1D95" />
      <circle cx="20" cy="18" r="1.7" fill="#4C1D95" />
      <path d="M12 22c1.2 1.2 2.8 1.8 4 1.8s2.8-.6 4-1.8" stroke="#7C3AED" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
