export default function LoadingSpinner({ className = 'h-5 w-5', label = 'Updating' }) {
  return (
    <span className={`inline-flex items-center justify-center ${className}`} role="status" aria-label={label}>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/25 border-t-current" />
    </span>
  )
}
