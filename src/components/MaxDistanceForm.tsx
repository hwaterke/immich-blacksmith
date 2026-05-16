import {useEffect, useState} from 'react'
import type {FormEvent} from 'react'

interface Props {
  value: number
  onApply: (next: number) => void
}

export function MaxDistanceForm({value, onApply}: Props) {
  const [raw, setRaw] = useState(String(value))

  useEffect(() => {
    setRaw(String(value))
  }, [value])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) onApply(n)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <label
        htmlFor="max-distance"
        className="island-kicker text-[10px] text-[var(--sea-ink-soft)]"
      >
        Max distance
      </label>
      <input
        id="max-distance"
        type="number"
        step="0.001"
        min="0"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        className="w-24 rounded-full border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-1 font-mono text-xs text-[var(--sea-ink)]"
      />
      <button
        type="submit"
        className="rounded-full bg-[var(--sea-ink)] px-3 py-1 text-xs font-semibold text-white transition hover:opacity-90"
      >
        Apply
      </button>
    </form>
  )
}
