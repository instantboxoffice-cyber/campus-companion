import { useState } from 'react'

export default function Avatar({ label = 'C', size = 'md', className = '', src, alt = '' }) {
  // If the image fails to load - slow connection, dropped request, bad
  // cache - fall through to the letter circle below instead of leaving
  // the browser's own broken-image icon on screen with the alt text
  // spilling out of it.
  const [failed, setFailed] = useState(false)

  const sizes = {
    sm: 'h-9 w-9 text-sm',
    md: 'h-12 w-12 text-base',
    lg: 'h-20 w-20 text-2xl',
  }

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${sizes[size]} ${className}`}
      />
    )
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-white ${sizes[size]} ${className}`}
    >
      {label}
    </div>
  )
}