import type {ReactNode} from 'react'
import {DuplicateAssetCard} from './DuplicateAssetCard'
import {MaxDistanceForm} from './MaxDistanceForm'
import type {AssetResult, SimilarResult} from '../lib/duplicateLoader'

interface Props {
  header: ReactNode
  source: AssetResult
  sourceHasEmbedding: boolean
  similars: SimilarResult[]
  maxDistance: number
  onApplyMaxDistance: (next: number) => void
}

export function DuplicatesReview({
  header,
  source,
  sourceHasEmbedding,
  similars,
  maxDistance,
  onApplyMaxDistance,
}: Props) {
  return (
    <main className="page-wrap px-4 py-8">
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
        {header}
      </section>

      <section className="mb-4">
        <MaxDistanceForm value={maxDistance} onApply={onApplyMaxDistance} />
      </section>

      <div className="-mx-4 overflow-x-auto px-4 pt-4 pb-4">
        <div className="flex gap-4">
          <div className="relative">
            <span className="absolute -top-2.5 left-3 z-10 rounded-full bg-[var(--sea-ink)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow">
              Source
            </span>
            <DuplicateAssetCard
              id={source.id}
              asset={source.asset}
              error={source.error}
              hasEmbedding={sourceHasEmbedding}
            />
          </div>

          {similars.length === 0 ? (
            <div className="island-shell flex w-[320px] shrink-0 flex-col justify-center rounded-2xl p-4">
              <p className="island-kicker mb-2">No similars</p>
              <p className="text-sm text-[var(--sea-ink-soft)]">
                No assets matched within the {maxDistance} distance threshold.
              </p>
            </div>
          ) : (
            similars.map((r) => (
              <DuplicateAssetCard
                key={r.id}
                id={r.id}
                asset={r.asset}
                error={r.error}
                hasEmbedding={true}
                distance={r.distance}
                reference={source.asset}
              />
            ))
          )}
        </div>
      </div>
    </main>
  )
}
