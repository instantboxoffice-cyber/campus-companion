import { useEffect } from 'react'

export default function ConfirmDialog({ title, body, confirmLabel = 'Delete', onConfirm, onCancel }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="alertdialog" aria-modal="true">
      <div className="fade-in absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="sheet-in relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {body && <p className="mt-1.5 text-sm text-slate-500">{body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}