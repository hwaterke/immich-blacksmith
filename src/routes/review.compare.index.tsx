import {createFileRoute, useNavigate} from '@tanstack/react-router'
import {useState} from 'react'
import type {FormEvent} from 'react'
import {resolveInputToAssetId} from '../lib/duplicateLoader'

export const Route = createFileRoute('/review/compare/')({
  component: ReviewCompareLanding,
})

function ReviewCompareLanding() {
  const navigate = useNavigate()
  const [inputA, setInputA] = useState('')
  const [inputB, setInputB] = useState('')
  const [errorA, setErrorA] = useState<string | null>(null)
  const [errorB, setErrorB] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    setErrorA(null)
    setErrorB(null)
    setSubmitting(true)
    try {
      const [resA, resB] = await Promise.all([
        resolveInputToAssetId(inputA),
        resolveInputToAssetId(inputB),
      ])
      if ('error' in resA) setErrorA(resA.error)
      if ('error' in resB) setErrorB(resB.error)
      if ('error' in resA || 'error' in resB) return
      navigate({
        to: '/review/compare/$id1/$id2',
        params: {id1: resA.assetId, id2: resB.assetId},
      })
    } finally {
      setSubmitting(false)
    }
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
          Enter two asset ids or original paths to see them side by side with
          cosine distance and a per-field diff.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start gap-2">
            <label
              htmlFor="asset-input-1"
              className="mt-1 w-20 text-sm font-medium"
              style={{color: 'var(--text-muted)'}}
            >
              Asset A
            </label>
            <div className="flex flex-col gap-1">
              <input
                id="asset-input-1"
                type="text"
                value={inputA}
                onChange={(e) => setInputA(e.target.value)}
                placeholder="asset id or original path"
                className="w-96 max-w-full rounded-md border px-2 py-1 font-mono text-sm"
                style={inputStyle}
              />
              {errorA && (
                <span className="text-xs" style={{color: 'var(--danger)'}}>
                  {errorA}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <label
              htmlFor="asset-input-2"
              className="mt-1 w-20 text-sm font-medium"
              style={{color: 'var(--text-muted)'}}
            >
              Asset B
            </label>
            <div className="flex flex-col gap-1">
              <input
                id="asset-input-2"
                type="text"
                value={inputB}
                onChange={(e) => setInputB(e.target.value)}
                placeholder="asset id or original path"
                className="w-96 max-w-full rounded-md border px-2 py-1 font-mono text-sm"
                style={inputStyle}
              />
              {errorB && (
                <span className="text-xs" style={{color: 'var(--danger)'}}>
                  {errorB}
                </span>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md px-3 py-1 text-sm font-semibold transition hover:brightness-110 disabled:opacity-60"
              style={{background: 'var(--accent)', color: 'var(--accent-fg)'}}
            >
              {submitting ? 'Resolving…' : 'Apply'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
