import {createFileRoute} from '@tanstack/react-router'
import {getAssetInfo} from '@immich/sdk'
import type {AssetResponseDto} from '@immich/sdk'
import {z} from 'zod'
import {ensureImmichInit} from '../lib/immich'
import {DuplicateAssetCard} from '../components/DuplicateAssetCard'

const SearchSchema = z.object({
  id: z.array(z.uuid()),
})

interface AssetResult {
  id: string
  asset?: AssetResponseDto
  error?: string
}

export const Route = createFileRoute('/duplicates')({
  validateSearch: SearchSchema,
  loaderDeps: ({search}) => ({ids: search.id}),
  loader: async ({deps}): Promise<{results: AssetResult[]}> => {
    if (deps.ids.length === 0) {
      return {results: []}
    }
    ensureImmichInit()
    const settled = await Promise.allSettled(
      deps.ids.map((id) => getAssetInfo({id})),
    )
    const results: AssetResult[] = settled.map((res, i) => {
      const id = deps.ids[i]
      if (res.status === 'fulfilled') {
        return {id, asset: res.value}
      }
      return {
        id,
        error:
          res.reason instanceof Error
            ? res.reason.message
            : 'Failed to load asset',
      }
    })
    return {results}
  },
  component: DuplicatesPage,
})

function DuplicatesPage() {
  const {results} = Route.useLoaderData()

  if (results.length === 0) {
    return (
      <main className="mx-auto w-full max-w-[1400px] px-4 py-12">
        <section
          className="rounded-lg border p-6"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
          }}
        >
          <p className="kicker mb-2">Duplicates</p>
          <h1
            className="mb-3 text-2xl font-bold"
            style={{color: 'var(--text)'}}
          >
            No assets to review
          </h1>
          <p style={{color: 'var(--text-muted)'}}>
            Pass asset IDs as <code>?id=…</code> query parameters to compare
            them. Example: <code>/duplicates?id=abc&amp;id=def</code>
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6">
      <section className="mb-6">
        <p className="kicker mb-1">Duplicates</p>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{color: 'var(--text)'}}
        >
          Reviewing {results.length} {results.length === 1 ? 'asset' : 'assets'}
        </h1>
      </section>

      <div
        className="-mx-4 overflow-x-auto px-4 pb-6"
        style={{scrollSnapType: 'x mandatory'}}
      >
        <div className="flex gap-4">
          {results.map((r, i) => (
            <DuplicateAssetCard
              key={r.id}
              id={r.id}
              asset={r.asset}
              error={r.error}
              label={`Asset ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </main>
  )
}
