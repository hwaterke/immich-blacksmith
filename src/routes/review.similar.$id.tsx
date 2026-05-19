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
  id: string
  maxDistance: number
}

export const Route = createFileRoute('/review/similar/$id')({
  validateSearch: SearchSchema,
  loaderDeps: ({search}) => ({maxDistance: search.maxDistance}),
  loader: async ({params, deps}): Promise<LoaderData> => {
    const data = await loadDuplicatesFor({
      data: {assetId: params.id, maxDistance: deps.maxDistance},
    })
    return {...data, id: params.id, maxDistance: deps.maxDistance}
  },
  component: ReviewSimilarPage,
})

function ReviewSimilarPage() {
  const data = Route.useLoaderData()
  const navigate = useNavigate()
  const filename = data.source.asset?.originalFileName

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="kicker mb-1">Review · similar</p>
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
          {data.id}
        </p>
      </div>
      <MaxDistanceForm
        value={data.maxDistance}
        onApply={(next) =>
          navigate({
            to: '/review/similar/$id',
            params: {id: data.id},
            search: {maxDistance: next},
          })
        }
      />
    </div>
  )

  return (
    <DuplicatesReview
      key={data.id}
      header={header}
      source={data.source}
      sourceHasEmbedding={data.sourceHasEmbedding}
      similars={data.similars}
      maxDistance={data.maxDistance}
      immichWebUrl={data.immichWebUrl}
    />
  )
}
