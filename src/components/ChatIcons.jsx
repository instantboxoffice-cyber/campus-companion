// Extra icons for the chat screen. Same plain line-icon style as Icons.jsx.
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  'aria-hidden': true,
}

export function ReplyIcon({ className = 'h-5 w-5' }) {
  return (
    <svg {...base} className={className}>
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  )
}

export function CopyIcon({ className = 'h-5 w-5' }) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

export function StarIcon({ className = 'h-5 w-5', filled = false }) {
  return (
    <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

export function DownloadIcon({ className = 'h-5 w-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export function ChevronDownIcon({ className = 'h-5 w-5' }) {
  return (
    <svg {...base} className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function ClockIcon({ className = 'h-3 w-3' }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

export function TextFormatIcon({ className = 'h-5 w-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 19 8.5 5 14 19" />
      <path d="M5 14h7" />
      <path d="M16 19l3-8 3 8" />
      <path d="M17 17h4" />
    </svg>
  )
}

export function SparklesIcon({ className = 'h-5 w-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </svg>
  )
}