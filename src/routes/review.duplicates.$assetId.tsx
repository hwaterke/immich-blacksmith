import {createFileRoute, useNavigate} from '@tanstack/react-router'
import {z} from 'zod'
import {DuplicatesReview} from '../components/DuplicatesReview'
import {MaxDistanceForm} from '../components/MaxDistanceForm'
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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="kicker mb-1">Review · duplicates</p>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{color: 'var(--text)'}}
        >
          {filename ?? 'Asset'}
        </h1>
        <p
          className="mt-1 break-all font-mono text-xs"
          style={{color: 'var(--text-faint)'}}
        >
          {data.assetId}
        </p>
      </div>
      <MaxDistanceForm
        value={data.maxDistance}
        onApply={(next) =>
          navigate({
            to: '/review/duplicates/$assetId',
            params: {assetId: data.assetId},
            search: {maxDistance: next},
          })
        }
      />
    </div>
  )

  return (
    <DuplicatesReview
      header={header}
      source={data.source}
      sourceHasEmbedding={data.sourceHasEmbedding}
      similars={data.similars}
      maxDistance={data.maxDistance}
    />
  )
}
