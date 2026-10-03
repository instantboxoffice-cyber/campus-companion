import { useEffect } from 'react'
import { VOICE_LANGUAGES } from '../../lib/voice'
import { XIcon } from '../../components/Icons'

function Toggle({ label, hint, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-xl px-1 py-2.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-slate-800">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      </span>
      <span
        className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
          checked ? 'bg-primary' : 'bg-slate-300'
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}

export default function VoiceSettings({ prefs, onChange, onClose }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const set = (patch) => onChange({ ...prefs, ...patch })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="fade-in absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="sheet-in relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Voice settings</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100">
            <XIcon className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <label className="block">
          <span className="text-[15px] font-medium text-slate-800">Language I speak</span>
          <select
            value={prefs.language}
            onChange={(e) => set({ language: e.target.value })}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-primary"
          >
            {VOICE_LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            Auto-detect works for most people. If it keeps getting your words wrong, pick your language.
          </span>
        </label>

        <div className="mt-3 divide-y divide-slate-100">
          <Toggle
            label="Send voice notes automatically"
            hint="On: your voice note is sent as a voice note the moment you stop recording. Off: your words appear as text in the box first, so you can fix them before sending."
            checked={prefs.autoSend}
            onChange={(v) => set({ autoSend: v })}
          />
          <Toggle
            label="Read replies aloud"
            hint="Replies to your voice messages are always read aloud. Turn this on to read every reply."
            checked={prefs.readAloud}
            onChange={(v) => set({ readAloud: v })}
          />
          <Toggle
            label="Natural voice"
            hint="A smoother voice from Google Gemini. It has a small free daily limit, and your phone voice takes over when it runs out. Yoruba, Hausa and Igbo replies always try it."
            checked={prefs.natural}
            onChange={(v) => set({ natural: v })}
          />
        </div>
      </div>
    </div>
  )
}