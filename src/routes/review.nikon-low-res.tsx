import {createFileRoute, Link} from '@tanstack/react-router'
import {ChevronLeft, ChevronRight} from 'lucide-react'
import {useEffect} from 'react'
import {z} from 'zod'
import {DuplicatesReview} from '../components/DuplicatesReview'
import type {AssetResult, SimilarResult} from '../lib/duplicateLoader'
import {getNikonLowResList, loadDuplicatesFor} from '../lib/duplicateLoader'
import {cn} from '../lib/utils'

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

  const header = (
    <>
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
    </>
  )

  return (
    <DuplicatesReview
      header={header}
      source={source}
      sourceHasEmbedding={sourceHasEmbedding}
      similars={similars}
      maxDistance={data.maxDistance}
      onApplyMaxDistance={(next) =>
        navigate({
          to: '/review/nikon-low-res',
          search: {index, maxDistance: next},
        })
      }
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
    <Link
      to="/review/nikon-low-res"
      search={{index: to, maxDistance}}
      className={className}
    >
      {!iconRight && icon}
      {label}
      {iconRight && icon}
    </Link>
  )
}
