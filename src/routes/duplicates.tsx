import {createFileRoute} from '@tanstack/react-router'
import {getAssetInfo, type AssetResponseDto} from '@immich/sdk'
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
      <main className="page-wrap px-4 py-12">
        <section className="island-shell rounded-2xl p-6 sm:p-8">
          <p className="island-kicker mb-2">Duplicates</p>
          <h1 className="display-title mb-3 text-3xl font-bold text-[var(--sea-ink)]">
            No assets to review
          </h1>
          <p className="m-0 text-base text-[var(--sea-ink-soft)]">
            Pass asset IDs as <code>?id=…</code> query parameters to compare
            them. Example: <code>/duplicates?id=abc&amp;id=def</code>
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="page-wrap px-4 py-8">
      <section className="mb-6">
        <p className="island-kicker mb-2">Duplicates</p>
        <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)]">
          Reviewing {results.length} {results.length === 1 ? 'asset' : 'assets'}
        </h1>
      </section>

      <div className="-mx-4 overflow-x-auto px-4 pb-4">
        <div className="flex gap-4">
          {results.map((r) => (
            <DuplicateAssetCard
              key={r.id}
              id={r.id}
              asset={r.asset}
              error={r.error}
            />
          ))}
        </div>
      </div>
    </main>
  )
}
