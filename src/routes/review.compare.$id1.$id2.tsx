import {createFileRoute} from '@tanstack/react-router'
import {DuplicateAssetCard} from '../components/DuplicateAssetCard'
import {loadComparison} from '../lib/duplicateLoader'
import type {ComparisonData} from '../lib/duplicateLoader'

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

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6">
      <section className="mb-6">
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
              <span
                className="inline-flex items-center rounded-full border px-3 py-1 font-mono text-sm font-semibold"
                style={{
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  borderColor: 'var(--border)',
                }}
                title={`Cosine distance: ${data.distance.toFixed(6)}`}
              >
                distance = {data.distance.toFixed(4)}
              </span>
            ) : (
              <span
                className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold"
                style={{
                  background: 'rgba(248, 81, 73, 0.16)',
                  color: 'var(--danger)',
                  borderColor: 'rgba(248, 81, 73, 0.4)',
                }}
              >
                Missing embedding(s)
              </span>
            )}
          </div>
        </div>
      </section>

      <div
        className="-mx-4 overflow-x-auto px-4 pb-6"
        style={{scrollSnapType: 'x mandatory'}}
      >
        <div className="flex gap-4">
          <DuplicateAssetCard
            id={data.a.id}
            originalPath={data.a.originalPath}
            asset={data.a.asset}
            error={data.a.error}
            reference={data.b.asset}
            label="A"
            immichWebUrl={data.immichWebUrl}
          />
          <DuplicateAssetCard
            id={data.b.id}
            originalPath={data.b.originalPath}
            asset={data.b.asset}
            error={data.b.error}
            distance={data.distance ?? undefined}
            reference={data.a.asset}
            label="B"
            immichWebUrl={data.immichWebUrl}
          />
        </div>
      </div>
    </main>
  )
}
