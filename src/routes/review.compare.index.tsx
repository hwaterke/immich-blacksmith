import {createFileRoute, useNavigate} from '@tanstack/react-router'
import {useState} from 'react'
import type {FormEvent} from 'react'

export const Route = createFileRoute('/review/compare/')({
  component: ReviewCompareLanding,
})

function ReviewCompareLanding() {
  const navigate = useNavigate()
  const [id1, setId1] = useState('')
  const [id2, setId2] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const a = id1.trim()
    const b = id2.trim()
    if (!a || !b) return
    navigate({to: '/review/compare/$id1/$id2', params: {id1: a, id2: b}})
  }

  const inputStyle = {
    background: 'var(--surface-2)',
    borderColor: 'var(--border)',
    color: 'var(--text)',
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
        <p className="kicker mb-2">Review · compare</p>
        <h1 className="mb-3 text-2xl font-bold" style={{color: 'var(--text)'}}>
          Compare two assets
        </h1>
        <p className="mb-6" style={{color: 'var(--text-muted)'}}>
          Enter two asset ids to see them side by side with cosine distance and
          a per-field diff.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="asset-id-1"
              className="w-20 text-sm font-medium"
              style={{color: 'var(--text-muted)'}}
            >
              Asset A
            </label>
            <input
              id="asset-id-1"
              type="text"
              value={id1}
              onChange={(e) => setId1(e.target.value)}
              placeholder="first asset id"
              className="w-96 max-w-full rounded-md border px-2 py-1 font-mono text-sm"
              style={inputStyle}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="asset-id-2"
              className="w-20 text-sm font-medium"
              style={{color: 'var(--text-muted)'}}
            >
              Asset B
            </label>
            <input
              id="asset-id-2"
              type="text"
              value={id2}
              onChange={(e) => setId2(e.target.value)}
              placeholder="second asset id"
              className="w-96 max-w-full rounded-md border px-2 py-1 font-mono text-sm"
              style={inputStyle}
            />
          </div>

          <div>
            <button
              type="submit"
              className="rounded-md px-3 py-1 text-sm font-semibold transition hover:brightness-110"
              style={{background: 'var(--accent)', color: 'var(--accent-fg)'}}
            >
              Apply
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
