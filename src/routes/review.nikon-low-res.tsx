import {createFileRoute, Link} from '@tanstack/react-router'
import {ChevronLeft, ChevronRight} from 'lucide-react'
import {useEffect} from 'react'
import {z} from 'zod'
import {ComparisonReview} from '../components/comparison/ComparisonReview'
import {MaxDistanceForm} from '../components/MaxDistanceForm'
import type {AssetResult, SimilarResult} from '../lib/duplicateLoader'
import {getNikonLowResList, loadDuplicatesFor} from '../lib/duplicateLoader'
import {buildSimilarSet} from '../lib/similarSet'

const SearchSchema = z.object({
  index: z.coerce.number().int().min(0).default(0).catch(0),
  maxDistance: z.coerce.number().positive().default(0.01).catch(0.01),
})

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
  maxDistance: number
  immichWebUrl: string
}

type LoaderData = LoaderEmpty | LoaderLoaded

export const Route = createFileRoute('/review/nikon-low-res')({
  validateSearch: SearchSchema,
  loaderDeps: ({search}) => ({
    index: search.index,
    maxDistance: search.maxDistance,
  }),
  loader: async ({deps}): Promise<LoaderData> => {
    const list = await getNikonLowResList()
    if (list.length === 0) {
      return {kind: 'empty'}
    }

    const requestedIndex = deps.index
    const index = Math.min(Math.max(requestedIndex, 0), list.length - 1)
    const source = list[index]

    const data = await loadDuplicatesFor({
      data: {assetId: source.id, maxDistance: deps.maxDistance},
    })

    return {
      kind: 'loaded',
      total: list.length,
      requestedIndex,
      index,
      sourcePath: source.originalPath,
      sourceHasEmbedding: data.sourceHasEmbedding,
      source: data.source,
      similars: data.similars,
      maxDistance: deps.maxDistance,
      immichWebUrl: data.immichWebUrl,
    }
  },
  component: ReviewNikonLowResPage,
})

function ReviewNikonLowResPage() {
  const data = Route.useLoaderData()

  const navigate = Route.useNavigate()
  const requestedIndex = data.kind === 'loaded' ? data.requestedIndex : null
  const resolvedIndex = data.kind === 'loaded' ? data.index : null
  const maxDistance = data.kind === 'loaded' ? data.maxDistance : null
  const total = data.kind === 'loaded' ? data.total : null

  // Reconcile requested vs clamped index in URL
  useEffect(() => {
    if (requestedIndex == null || resolvedIndex == null || maxDistance == null)
      return
    if (requestedIndex !== resolvedIndex) {
      navigate({
        to: '/review/nikon-low-res',
        search: {index: resolvedIndex, maxDistance},
        replace: true,
      })
    }
  }, [requestedIndex, resolvedIndex, maxDistance, navigate])

  // Arrow-key navigation
  useEffect(() => {
    if (resolvedIndex == null || maxDistance == null || total == null) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t) {
        const tag = t.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (t.isContentEditable) return
      }
      if (e.key === 'ArrowLeft' && resolvedIndex! > 0) {
        e.preventDefault()
        navigate({
          to: '/review/nikon-low-res',
          search: {index: resolvedIndex! - 1, maxDistance: maxDistance!},
        })
      } else if (e.key === 'ArrowRight' && resolvedIndex! < total! - 1) {
        e.preventDefault()
        navigate({
          to: '/review/nikon-low-res',
          search: {index: resolvedIndex! + 1, maxDistance: maxDistance!},
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [resolvedIndex, maxDistance, total, navigate])

  if (data.kind === 'empty') {
    return (
      <main className="mx-auto w-full max-w-[1400px] px-4 py-12">
        <section
          className="rounded-lg border p-6"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
          }}
        >
          <p className="kicker mb-2">Review</p>
          <h1
            className="mb-3 text-2xl font-bold"
            style={{color: 'var(--text)'}}
          >
            No nikon-low-res assets to review
          </h1>
          <p style={{color: 'var(--text-muted)'}}>
            Nothing matched <code>to-sort/nikon-low-res</code>.
          </p>
        </section>
      </main>
    )
  }

  const {
    index,
    source,
    similars,
    sourcePath,
    sourceHasEmbedding,
    immichWebUrl,
  } = data
  const {assets, distances, missing} = buildSimilarSet(source, similars)
  const hasPrev = index > 0
  const hasNext = index < data.total - 1
  const progress = ((index + 1) / data.total) * 100

  const header = (
    <div>
      <div
        className="mb-4 h-1 w-full overflow-hidden rounded-full"
        style={{background: 'var(--surface-2)'}}
        aria-label={`Progress: ${index + 1} of ${data.total}`}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{width: `${progress}%`, background: 'var(--accent)'}}
        />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="kicker mb-1">Review · nikon-low-res</p>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{color: 'var(--text)'}}
          >
            {index + 1}{' '}
            <span style={{color: 'var(--text-faint)'}}>of {data.total}</span>
          </h1>
          <p
            className="mt-1 break-all font-mono text-xs"
            style={{color: 'var(--text-faint)'}}
            title={sourcePath}
          >
            {sourcePath}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <MaxDistanceForm
            value={data.maxDistance}
            onApply={(next) =>
              navigate({
                to: '/review/nikon-low-res',
                search: {index, maxDistance: next},
              })
            }
          />
          <nav
            className="flex items-center gap-1.5"
            aria-label="Review navigation"
          >
            <NavButton
              to={index - 1}
              maxDistance={data.maxDistance}
              disabled={!hasPrev}
              label="Previous"
              icon={<ChevronLeft size={16} />}
            />
            <NavButton
              to={index + 1}
              maxDistance={data.maxDistance}
              disabled={!hasNext}
              label="Next"
              icon={<ChevronRight size={16} />}
              iconRight
            />
          </nav>
        </div>
      </div>
      <p className="mt-2 text-xs" style={{color: 'var(--text-faint)'}}>
        Tip: use ← / → arrow keys to navigate.
      </p>
    </div>
  )

  const empty = (
    <div
      className="rounded-[11px] border p-6"
      style={{background: 'var(--surface)', borderColor: 'var(--border)'}}
    >
      <p className="kicker mb-2">No matches</p>
      <p className="text-sm" style={{color: 'var(--ink-2)'}}>
        {sourceHasEmbedding
          ? `No assets matched within the ${data.maxDistance} distance threshold. Try increasing it.`
          : 'This asset has no embedding, so similar assets cannot be found.'}
      </p>
    </div>
  )

  return (
    <ComparisonReview
      key={source.id}
      header={header}
      assets={assets}
      distances={distances}
      immichWebUrl={immichWebUrl}
      countLabel={`${assets.length} candidates`}
      countSub="nikon low-res"
      missing={missing}
      empty={empty}
    />
  )
}

interface NavButtonProps {
  to: number
  maxDistance: number
  disabled: boolean
  label: string
  icon: React.ReactNode
  iconRight?: boolean
}

function NavButton({
  to,
  maxDistance,
  disabled,
  label,
  icon,
  iconRight,
}: NavButtonProps) {
  const enabledStyle = {
    background: 'var(--accent)',
    color: 'var(--accent-fg)',
  }
  const disabledStyle = {
    background: 'var(--surface-2)',
    color: 'var(--text-faint)',
    cursor: 'not-allowed' as const,
  }
  const className =
    'inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold transition'

  if (disabled) {
    return (
      <span className={className} style={disabledStyle} aria-disabled="true">
        {!iconRight && icon}
        {label}
        {iconRight && icon}
      </span>
    )
  }

  return (
    <Link
      to="/review/nikon-low-res"
      search={{index: to, maxDistance}}
      className={className}
      style={enabledStyle}
    >
      {!iconRight && icon}
      {label}
      {iconRight && icon}
    </Link>
  )
}
