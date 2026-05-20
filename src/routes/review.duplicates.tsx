import {createFileRoute, Link} from '@tanstack/react-router'
import {ChevronLeft, ChevronRight} from 'lucide-react'
import {useEffect} from 'react'
import {z} from 'zod'
import {DuplicateAssetCard} from '../components/DuplicateAssetCard'
import {loadDuplicateGroup} from '../lib/duplicateLoader'
import type {DuplicateGroupResult} from '../lib/duplicateLoader'

const SearchSchema = z.object({
  index: z.coerce.number().int().min(0).default(0).catch(0),
})

type LoaderData = DuplicateGroupResult & {requestedIndex: number}

export const Route = createFileRoute('/review/duplicates')({
  validateSearch: SearchSchema,
  loaderDeps: ({search}) => ({index: search.index}),
  loader: async ({deps}): Promise<LoaderData> => {
    const result = await loadDuplicateGroup({data: {index: deps.index}})
    return {...result, requestedIndex: deps.index}
  },
  component: ReviewDuplicatesPage,
})

function ReviewDuplicatesPage() {
  const data = Route.useLoaderData()
  const navigate = Route.useNavigate()

  const requestedIndex = data.kind === 'loaded' ? data.requestedIndex : null
  const resolvedIndex = data.kind === 'loaded' ? data.index : null
  const total = data.kind === 'loaded' ? data.total : null

  // Reconcile requested vs clamped index in URL
  useEffect(() => {
    if (requestedIndex == null || resolvedIndex == null) return
    if (requestedIndex !== resolvedIndex) {
      navigate({
        to: '/review/duplicates',
        search: {index: resolvedIndex},
        replace: true,
      })
    }
  }, [requestedIndex, resolvedIndex, navigate])

  // Arrow-key navigation
  useEffect(() => {
    if (resolvedIndex == null || total == null) return
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
          to: '/review/duplicates',
          search: {index: resolvedIndex! - 1},
        })
      } else if (e.key === 'ArrowRight' && resolvedIndex! < total! - 1) {
        e.preventDefault()
        navigate({
          to: '/review/duplicates',
          search: {index: resolvedIndex! + 1},
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [resolvedIndex, total, navigate])

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
            No duplicates to review
          </h1>
          <p style={{color: 'var(--text-muted)'}}>
            Immich reported no duplicate sets. Run duplicate detection on the
            Immich server, then come back.
          </p>
        </section>
      </main>
    )
  }

  const {index, total: count, group, immichWebUrl} = data
  const hasPrev = index > 0
  const hasNext = index < count - 1
  const progress = ((index + 1) / count) * 100
  const reference = group.assets[0]
  const suggestedKeep = new Set(group.suggestedKeepAssetIds)

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6">
      <section className="mb-6">
        <div
          className="mb-4 h-1 w-full overflow-hidden rounded-full"
          style={{background: 'var(--surface-2)'}}
          aria-label={`Progress: ${index + 1} of ${count}`}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{width: `${progress}%`, background: 'var(--accent)'}}
          />
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="kicker mb-1">Review · duplicates</p>
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{color: 'var(--text)'}}
            >
              {index + 1}{' '}
              <span style={{color: 'var(--text-faint)'}}>of {count}</span>
            </h1>
            <p
              className="mt-1 break-all font-mono text-xs"
              style={{color: 'var(--text-faint)'}}
              title={group.duplicateId}
            >
              {group.duplicateId}
            </p>
          </div>

          <nav
            className="flex items-center gap-1.5"
            aria-label="Review navigation"
          >
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
        </div>
        <p className="mt-2 text-xs" style={{color: 'var(--text-faint)'}}>
          Tip: use ← / → arrow keys to navigate.
        </p>
      </section>

      <div
        key={group.duplicateId}
        className="-mx-4 overflow-x-auto px-4 pb-6"
        style={{scrollSnapType: 'x mandatory'}}
      >
        <div className="flex gap-4">
          {group.assets.map((asset, i) => (
            <DuplicateAssetCard
              key={asset.id}
              id={asset.id}
              originalPath={asset.originalPath}
              asset={asset}
              reference={i === 0 ? undefined : reference}
              label={
                suggestedKeep.has(asset.id)
                  ? `Asset ${i + 1} · suggested keep`
                  : `Asset ${i + 1}`
              }
              immichWebUrl={immichWebUrl}
            />
          ))}
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
      to="/review/duplicates"
      search={{index: to}}
      className={className}
      style={enabledStyle}
    >
      {!iconRight && icon}
      {label}
      {iconRight && icon}
    </Link>
  )
}
