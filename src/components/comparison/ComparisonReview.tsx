import type {ReactNode} from 'react'
import type {AssetResponseDto} from '@immich/sdk'
import {buildComparisonModel} from '../../lib/assetComparison'
import type {MissingAsset} from '../../lib/similarSet'
import {useFlagForDeletion} from '../../lib/useFlagForDeletion'
import {ComparisonTable} from './ComparisonTable'

interface Props {
  header: ReactNode
  /** Column order: index 0 is treated as the reference. */
  assets: AssetResponseDto[]
  /** assetId → vector distance to the reference. */
  distances?: Record<string, number | null | undefined>
  suggestedKeepIds?: string[]
  immichWebUrl: string
  countLabel?: string
  countSub?: string
  /** Assets that could not be loaded — surfaced below the table. */
  missing?: MissingAsset[]
  /** Shown when there are no comparable assets. */
  empty?: ReactNode
}

/** Shared review screen for the similar / compare pages: a header above the
 *  comparison table, with flag-for-deletion wired in (no action bar here). */
export function ComparisonReview({
  header,
  assets,
  distances,
  suggestedKeepIds,
  immichWebUrl,
  countLabel,
  countSub,
  missing,
  empty,
}: Props) {
  const {flaggedIds, flag} = useFlagForDeletion()
  const model = buildComparisonModel(assets, {
    distances,
    suggestedKeepIds,
    immichWebUrl,
  })

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6">
      <section className="mb-6">{header}</section>

      {assets.length === 0 ? (
        empty
      ) : (
        <ComparisonTable
          model={model}
          flaggedIds={flaggedIds}
          onFlag={flag}
          countLabel={countLabel}
          countSub={countSub}
        />
      )}

      {missing && missing.length > 0 ? (
        <section
          className="mt-4 rounded-[11px] border p-4"
          style={{background: 'var(--surface)', borderColor: 'var(--border)'}}
        >
          <p className="kicker mb-2">Unavailable assets</p>
          <ul className="space-y-1">
            {missing.map((m) => (
              <li
                key={m.id}
                className="font-mono text-xs"
                style={{color: 'var(--ink-3)'}}
              >
                {m.originalPath ?? m.id}
                {m.error ? ` — ${m.error}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
