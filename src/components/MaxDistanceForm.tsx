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
        className="text-sm font-medium"
        style={{color: 'var(--text-muted)'}}
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
        className="w-24 rounded-md border px-2 py-1 font-mono text-sm"
        style={{
          background: 'var(--surface-2)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
      />
      <button
        type="submit"
        className="rounded-md px-3 py-1 text-sm font-semibold transition hover:brightness-110"
        style={{background: 'var(--accent)', color: 'var(--accent-fg)'}}
      >
        Apply
      </button>
    </form>
  )
}
