import {createFileRoute, useNavigate} from '@tanstack/react-router'
import {useState} from 'react'
import type {FormEvent} from 'react'
import {resolveInputToAssetId} from '../lib/duplicateLoader'

export const Route = createFileRoute('/review/similar/')({
  component: ReviewSimilarLanding,
})

function ReviewSimilarLanding() {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const result = await resolveInputToAssetId(input)
      if ('error' in result) {
        setError(result.error)
        return
      }
      navigate({to: '/review/similar/$id', params: {id: result.assetId}})
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-12">
      <section
        className="rounded-lg border p-6"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        <p className="kicker mb-2">Review · similar</p>
        <h1 className="mb-3 text-2xl font-bold" style={{color: 'var(--text)'}}>
          Find similar assets
        </h1>
        <p className="mb-6" style={{color: 'var(--text-muted)'}}>
          Enter an asset id or an original path to see its source and a ranked
          list of similar assets by cosine distance.
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-wrap items-start gap-2"
        >
          <label
            htmlFor="asset-input"
            className="mt-1 text-sm font-medium"
            style={{color: 'var(--text-muted)'}}
          >
            Asset id or original path
          </label>
          <div className="flex flex-col gap-1">
            <input
              id="asset-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. 8f3c… or /photos/IMG_1234.jpg"
              className="w-96 max-w-full rounded-md border px-2 py-1 font-mono text-sm"
              style={{
                background: 'var(--surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
            />
            {error && (
              <span className="text-xs" style={{color: 'var(--danger)'}}>
                {error}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md px-3 py-1 text-sm font-semibold transition hover:brightness-110 disabled:opacity-60"
            style={{background: 'var(--accent)', color: 'var(--accent-fg)'}}
          >
            {submitting ? 'Resolving…' : 'Apply'}
          </button>
        </form>
      </section>
    </main>
  )
}
