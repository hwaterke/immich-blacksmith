import {createFileRoute} from '@tanstack/react-router'
import {useEffect, useMemo} from 'react'
import {z} from 'zod'
import {ComparisonActionBar} from '../components/comparison/ComparisonActionBar'
import {ComparisonHeader} from '../components/comparison/ComparisonHeader'
import {ComparisonTable} from '../components/comparison/ComparisonTable'
import {buildComparisonModel, formatBytes} from '../lib/assetComparison'
import {loadDuplicateGroup} from '../lib/duplicateLoader'
import type {DuplicateGroupResult} from '../lib/duplicateLoader'
import {useFlagForDeletion} from '../lib/useFlagForDeletion'

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

const RADIAL_BG =
  'radial-gradient(130% 90% at 50% -10%, oklch(0.205 0.005 70) 0%, oklch(0.15 0.004 70) 60%)'

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

  const goTo = useMemo(
    () => (i: number) =>
      navigate({to: '/review/duplicates', search: {index: i}}),
    [navigate],
  )

  // Keyboard navigation: ← / → step groups, ⏎ advances.
  useEffect(() => {
    if (resolvedIndex == null || total == null) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t) {
        const tag = t.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (t.isContentEditable) return
      }
      if (e.key === 'ArrowLeft' && resolvedIndex! > 0) {
        e.preventDefault()
        goTo(resolvedIndex! - 1)
      } else if (
        (e.key === 'ArrowRight' || e.key === 'Enter') &&
        resolvedIndex! < total! - 1
      ) {
        e.preventDefault()
        goTo(resolvedIndex! + 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [resolvedIndex, total, goTo])

  if (data.kind === 'empty') {
    return (
      <main className="mx-auto w-full max-w-[1400px] px-4 py-12">
        <section
          className="rounded-lg border p-6"
          style={{background: 'var(--surface)', borderColor: 'var(--border)'}}
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

  return (
    <DuplicateGroupScreen
      key={data.group.duplicateId}
      data={data}
      onGoTo={goTo}
    />
  )
}

interface ScreenProps {
  data: Extract<DuplicateGroupResult, {kind: 'loaded'}> & {
    requestedIndex: number
  }
  onGoTo: (index: number) => void
}

function DuplicateGroupScreen({data, onGoTo}: ScreenProps) {
  const {index, total, group, referenceDistances, immichWebUrl} = data
  const {flaggedIds, flag} = useFlagForDeletion()

  const model = useMemo(
    () =>
      buildComparisonModel(group.assets, {
        distances: referenceDistances,
        suggestedKeepIds: group.suggestedKeepAssetIds,
        immichWebUrl,
      }),
    [group, referenceDistances, immichWebUrl],
  )

  const deleting = flaggedIds.size
  const keeping = group.assets.length - deleting
  const freedBytes = group.assets
    .filter((a) => flaggedIds.has(a.id))
    .reduce((sum, a) => sum + (a.exifInfo?.fileSizeInByte ?? 0), 0)
  const summary = `Keeping ${keeping} · deleting ${deleting}${
    freedBytes > 0 ? ` · frees ${formatBytes(freedBytes)}` : ''
  }`

  const hasNext = index < total - 1

  return (
    <div
      className="flex flex-col"
      style={{height: 'calc(100vh - 54px)', background: RADIAL_BG}}
    >
      <ComparisonHeader
        title={`Duplicate group ${index + 1} of ${total}`}
        subtitle={group.duplicateId}
        photoCount={group.assets.length}
        totalSize={model.totalSize}
        matchPercent={model.matchPercent}
      />

      <div className="flex-1 overflow-auto px-[26px] pb-[22px]">
        <ComparisonTable
          model={model}
          flaggedIds={flaggedIds}
          onFlag={flag}
          countLabel={`${group.assets.length} candidates`}
          countSub="duplicate group"
        />
      </div>

      <ComparisonActionBar
        summary={summary}
        applyLabel={hasNext ? 'Apply & next' : 'Done'}
        onApply={() => hasNext && onGoTo(index + 1)}
        onSkip={hasNext ? () => onGoTo(index + 1) : undefined}
        applyDisabled={!hasNext}
      />
    </div>
  )
}
