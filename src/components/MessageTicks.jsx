import { CheckIcon, DoubleCheckIcon } from './Icons'
import { ClockIcon } from './ChatIcons'

// The little status mark beside your own messages:
//   clock         = still sending
//   one tick      = sent (saved on the server)
//   two ticks     = received (their phone has it)
//   two green     = read (on a blue bubble) / two blue (on a white background)
// "Not sent" (failed) is shown as a red retry button by the caller.
export default function MessageTicks({ sending = false, deliveredAt = null, readAt = null, onPrimary = false }) {
  if (sending) return <ClockIcon />

  if (readAt) {
    return (
      <span title="Read" aria-label="Read" className="inline-flex">
        <DoubleCheckIcon className={`h-3.5 w-3.5 ${onPrimary ? 'text-emerald-300' : 'text-primary'}`} />
      </span>
    )
  }
  if (deliveredAt) {
    return (
      <span title="Received" aria-label="Received" className="inline-flex">
        <DoubleCheckIcon className="h-3.5 w-3.5" />
      </span>
    )
  }
  return (
    <span title="Sent" aria-label="Sent" className="inline-flex">
      <CheckIcon className="h-3 w-3" />
    </span>
  )
}
