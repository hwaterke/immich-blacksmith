import {createFileRoute, useNavigate} from '@tanstack/react-router'
import {z} from 'zod'
import {DuplicatesReview} from '../components/DuplicatesReview'
import {loadDuplicatesFor} from '../lib/duplicateLoader'
import type {DuplicatesData} from '../lib/duplicateLoader'

const SearchSchema = z.object({
  maxDistance: z.coerce.number().positive().default(0.01).catch(0.01),
})

interface LoaderData extends DuplicatesData {
  assetId: string
  maxDistance: number
}

export const Route = createFileRoute('/review/duplicates/$assetId')({
  validateSearch: SearchSchema,
  loaderDeps: ({search}) => ({maxDistance: search.maxDistance}),
  loader: async ({params, deps}): Promise<LoaderData> => {
    const data = await loadDuplicatesFor({
      data: {assetId: params.assetId, maxDistance: deps.maxDistance},
    })
    return {...data, assetId: params.assetId, maxDistance: deps.maxDistance}
  },
  component: ReviewDuplicatesPage,
})

function ReviewDuplicatesPage() {
  const data = Route.useLoaderData()
  const navigate = useNavigate()
  const filename = data.source.asset?.originalFileName

  const header = (
    <div>
      <p className="island-kicker mb-2">Review · duplicates</p>
      <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)]">
        {filename ?? 'Asset'}
      </h1>
      <p className="mt-2 break-all font-mono text-xs text-[var(--sea-ink-soft)]">
        {data.assetId}
      </p>
    </div>
  )

  return (
    <DuplicatesReview
      header={header}
      source={data.source}
      sourceHasEmbedding={data.sourceHasEmbedding}
      similars={data.similars}
      maxDistance={data.maxDistance}
      onApplyMaxDistance={(next) =>
        navigate({
          to: '/review/duplicates/$assetId',
          params: {assetId: data.assetId},
          search: {maxDistance: next},
        })
      }
    />
  )
}
