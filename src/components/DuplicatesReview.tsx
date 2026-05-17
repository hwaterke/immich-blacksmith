import type {ReactNode} from 'react'
import {DuplicateAssetCard} from './DuplicateAssetCard'
import type {AssetResult, SimilarResult} from '../lib/duplicateLoader'

interface Props {
  header: ReactNode
  source: AssetResult
  sourceHasEmbedding: boolean
  similars: SimilarResult[]
  maxDistance: number
  immichWebUrl: string
}

export function DuplicatesReview({
  header,
  source,
  sourceHasEmbedding,
  similars,
  maxDistance,
  immichWebUrl,
}: Props) {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6">
      <section className="mb-6">{header}</section>

      <div
        className="-mx-4 overflow-x-auto px-4 pb-6"
        style={{scrollSnapType: 'x mandatory'}}
      >
        <div className="flex gap-4">
          <DuplicateAssetCard
            id={source.id}
            originalPath={source.originalPath}
            asset={source.asset}
            error={source.error}
            hasEmbedding={sourceHasEmbedding}
            label="Source"
            immichWebUrl={immichWebUrl}
          />

          {similars.length === 0 ? (
            <div
              className="flex w-[360px] shrink-0 snap-start flex-col justify-center rounded-lg border p-6"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
              }}
            >
              <p className="kicker mb-2">No matches</p>
              <p className="text-sm" style={{color: 'var(--text-muted)'}}>
                No assets matched within the {maxDistance} distance threshold.
                Try increasing it.
              </p>
            </div>
          ) : (
            similars.map((r, i) => (
              <DuplicateAssetCard
                key={r.id}
                id={r.id}
                originalPath={r.originalPath}
                asset={r.asset}
                error={r.error}
                hasEmbedding={true}
                distance={r.distance}
                reference={source.asset}
                label={`Match ${i + 1}`}
                immichWebUrl={immichWebUrl}
              />
            ))
          )}
        </div>
      </div>
    </main>
  )
}
