import {createFileRoute, useNavigate} from '@tanstack/react-router'
import {useState} from 'react'
import type {FormEvent} from 'react'

export const Route = createFileRoute('/review/similar/')({
  component: ReviewSimilarLanding,
})

function ReviewSimilarLanding() {
  const navigate = useNavigate()
  const [id, setId] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = id.trim()
    if (!trimmed) return
    navigate({to: '/review/similar/$id', params: {id: trimmed}})
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
          Enter an asset id to see its source and a ranked list of similar
          assets by cosine distance.
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-wrap items-center gap-2"
        >
          <label
            htmlFor="asset-id"
            className="text-sm font-medium"
            style={{color: 'var(--text-muted)'}}
          >
            Asset id
          </label>
          <input
            id="asset-id"
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="e.g. 8f3c…"
            className="w-96 max-w-full rounded-md border px-2 py-1 font-mono text-sm"
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
      </section>
    </main>
  )
}
