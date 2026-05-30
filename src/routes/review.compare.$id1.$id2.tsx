import {createFileRoute} from '@tanstack/react-router'
import type {AssetResponseDto} from '@immich/sdk'
import {ComparisonReview} from '../components/comparison/ComparisonReview'
import {loadComparison} from '../lib/duplicateLoader'
import type {AssetResult, ComparisonData} from '../lib/duplicateLoader'
import type {MissingAsset} from '../lib/similarSet'

interface LoaderData extends ComparisonData {
  id1: string
  id2: string
}

export const Route = createFileRoute('/review/compare/$id1/$id2')({
  loader: async ({params}): Promise<LoaderData> => {
    const data = await loadComparison({
      data: {id1: params.id1, id2: params.id2},
    })
    return {...data, id1: params.id1, id2: params.id2}
  },
  component: ReviewComparePage,
})

function ReviewComparePage() {
  const data = Route.useLoaderData()

  const assets: AssetResponseDto[] = []
  const missing: MissingAsset[] = []
  const collect = (r: AssetResult) => {
    if (r.asset) assets.push(r.asset)
    else missing.push({id: r.id, originalPath: r.originalPath, error: r.error})
  }
  collect(data.a)
  collect(data.b)

  // Distance is the a↔b pair distance; attach it to b (the non-reference column).
  const distances: Record<string, number> =
    data.distance != null ? {[data.b.id]: data.distance} : {}

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="kicker mb-1">Review · compare</p>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{color: 'var(--text)'}}
        >
          Side by side
        </h1>
        <p
          className="mt-1 break-all font-mono text-xs"
          style={{color: 'var(--text-faint)'}}
        >
          {data.id1} ↔ {data.id2}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {data.distance != null ? (
          <span className="pill ghost font-mono">
            distance = {data.distance.toFixed(4)}
          </span>
        ) : (
          <span
            className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold"
            style={{
              background: 'var(--del-soft)',
              color: 'var(--del-ink)',
              borderColor: 'var(--del-line)',
            }}
          >
            Missing embedding(s)
          </span>
        )}
      </div>
    </div>
  )

  const empty = (
    <div
      className="rounded-[11px] border p-6"
      style={{background: 'var(--surface)', borderColor: 'var(--border)'}}
    >
      <p className="kicker mb-2">Nothing to compare</p>
      <p className="text-sm" style={{color: 'var(--ink-2)'}}>
        Neither asset could be loaded.
      </p>
    </div>
  )

  return (
    <ComparisonReview
      header={header}
      assets={assets}
      distances={distances}
      immichWebUrl={data.immichWebUrl}
      countLabel={`${assets.length} ${assets.length === 1 ? 'asset' : 'assets'}`}
      countSub="side by side"
      missing={missing}
      empty={empty}
    />
  )
}
