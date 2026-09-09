export default function Avatar({ label = 'C', size = 'md', className = '' }) {
  const sizes = {
    sm: 'h-9 w-9 text-sm',
    md: 'h-12 w-12 text-base',
    lg: 'h-20 w-20 text-2xl',
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-white/15 font-semibold text-white ${sizes[size]} ${className}`}
    >
      {label}
    </div>
  )
}
