import {useEffect} from 'react'
import {createFileRoute, Link, useNavigate} from '@tanstack/react-router'
import {ChevronLeft, ChevronRight} from 'lucide-react'
import {getAssetInfo} from '@immich/sdk'
import type {AssetResponseDto} from '@immich/sdk'
import {z} from 'zod'
import {ensureImmichInit} from '../lib/immich'
import {DuplicateAssetCard} from '../components/DuplicateAssetCard'
import {findSimilarAssetIds, getNikonLowResAssets} from '../lib/assetQueries'
import {cn} from '../lib/utils'

const SearchSchema = z.object({
  index: z.coerce.number().int().min(0).catch(0),
})

interface AssetResult {
  id: string
  asset?: AssetResponseDto
  error?: string
}

interface SimilarResult extends AssetResult {
  distance: number
}

interface LoaderEmpty {
  kind: 'empty'
}

interface LoaderLoaded {
  kind: 'loaded'
  total: number
  requestedIndex: number
  index: number
  sourcePath: string
  sourceHasEmbedding: boolean
  source: AssetResult
  similars: SimilarResult[]
}

type LoaderData = LoaderEmpty | LoaderLoaded

async function loadAsset(id: string): Promise<AssetResult> {
  try {
    const asset = await getAssetInfo({id})
    return {id, asset}
  } catch (err) {
    return {
      id,
      error: err instanceof Error ? err.message : 'Failed to load asset',
    }
  }
}

export const Route = createFileRoute('/review/nikon-low-res')({
  validateSearch: SearchSchema,
  loaderDeps: ({search}) => ({index: search.index}),
  loader: async ({deps}): Promise<LoaderData> => {
    const list = await getNikonLowResAssets()
    if (list.length === 0) {
      return {kind: 'empty'}
    }

    const requestedIndex = deps.index
    const index = Math.min(Math.max(requestedIndex, 0), list.length - 1)
    const source = list[index]

    const {sourceHasEmbedding, results: similars} = await findSimilarAssetIds(
      source.id,
    )

    ensureImmichInit()
    const [sourceResult, ...similarAssetResults] = await Promise.all([
      loadAsset(source.id),
      ...similars.map((s) => loadAsset(s.assetId)),
    ])

    const similarResults: SimilarResult[] = similars.map((s, i) => ({
      ...similarAssetResults[i],
      distance: s.distance,
    }))

    return {
      kind: 'loaded',
      total: list.length,
      requestedIndex,
      index,
      sourcePath: source.originalPath,
      sourceHasEmbedding,
      source: sourceResult,
      similars: similarResults,
    }
  },
  component: ReviewNikonLowResPage,
})

function ReviewNikonLowResPage() {
  const data = Route.useLoaderData()
  const navigate = useNavigate()
  const requestedIndex = data.kind === 'loaded' ? data.requestedIndex : null
  const resolvedIndex = data.kind === 'loaded' ? data.index : null

  useEffect(() => {
    if (requestedIndex == null || resolvedIndex == null) return
    if (requestedIndex !== resolvedIndex) {
      navigate({
        to: '/review/nikon-low-res',
        search: {index: resolvedIndex},
        replace: true,
      })
    }
  }, [requestedIndex, resolvedIndex, navigate])

  if (data.kind === 'empty') {
    return (
      <main className="page-wrap px-4 py-12">
        <section className="island-shell rounded-2xl p-6 sm:p-8">
          <p className="island-kicker mb-2">Review</p>
          <h1 className="display-title mb-3 text-3xl font-bold text-[var(--sea-ink)]">
            No nikon-low-res assets to review
          </h1>
          <p className="m-0 text-base text-[var(--sea-ink-soft)]">
            Nothing matched <code>to-sort/nikon-low-res</code>.
          </p>
        </section>
      </main>
    )
  }

  const {total, index, source, similars, sourcePath, sourceHasEmbedding} = data
  const hasPrev = index > 0
  const hasNext = index < total - 1

  return (
    <main className="page-wrap px-4 py-8">
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="island-kicker mb-2">Review · nikon-low-res</p>
          <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)]">
            {index + 1} of {total}
          </h1>
          <p
            className="mt-2 break-all font-mono text-xs text-[var(--sea-ink-soft)]"
            title={sourcePath}
          >
            {sourcePath}
          </p>
        </div>

        <nav className="flex items-center gap-2">
          <NavButton
            to={index - 1}
            disabled={!hasPrev}
            label="Previous"
            icon={<ChevronLeft size={16} />}
          />
          <NavButton
            to={index + 1}
            disabled={!hasNext}
            label="Next"
            icon={<ChevronRight size={16} />}
            iconRight
          />
        </nav>
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
                No assets matched within the 0.01 distance threshold.
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

interface NavButtonProps {
  to: number
  disabled: boolean
  label: string
  icon: React.ReactNode
  iconRight?: boolean
}

function NavButton({to, disabled, label, icon, iconRight}: NavButtonProps) {
  const className = cn(
    'flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold transition',
    disabled
      ? 'cursor-not-allowed bg-black/5 text-[var(--sea-ink-soft)]'
      : 'bg-[var(--sea-ink)] text-white hover:opacity-90',
  )

  if (disabled) {
    return (
      <span className={className} aria-disabled="true">
        {!iconRight && icon}
        {label}
        {iconRight && icon}
      </span>
    )
  }

  return (
    <Link to="/review/nikon-low-res" search={{index: to}} className={className}>
      {!iconRight && icon}
      {label}
      {iconRight && icon}
    </Link>
  )
}
