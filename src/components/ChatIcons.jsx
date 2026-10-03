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

export function MicIcon({ className = 'h-5 w-5' }) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  )
}

export function StopIcon({ className = 'h-5 w-5' }) {
  return (
    <svg {...base} className={className} fill="currentColor" stroke="none">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

export function SpeakerIcon({ className = 'h-5 w-5' }) {
  return (
    <svg {...base} className={className}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  )
}

export function PaperclipIcon({ className = 'h-5 w-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2" />
    </svg>
  )
}

export function ImageIcon({ className = 'h-5 w-5' }) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

export function FileIcon({ className = 'h-5 w-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  )
}

export function CameraOutlineIcon({ className = 'h-5 w-5' }) {
  return (
    <svg {...base} className={className}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

export function ArrowDownIcon({ className = 'h-5 w-5' }) {
  return (
    <svg {...base} className={className}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  )
}
