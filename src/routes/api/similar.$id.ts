import {createFileRoute} from '@tanstack/react-router'
import {z} from 'zod'
import {findSimilarAssetIds} from '../../lib/server/assetQueries'
import {withRequestLogging} from '../../lib/server/logger'

export const Route = createFileRoute('/api/similar/$id')({
  validateSearch: z.object({
    maxDistance: z.number().optional(),
  }),
  server: {
    handlers: {
      GET: withRequestLogging('api:similar', async ({params, request}) => {
        const url = new URL(request.url)
        const raw = url.searchParams.get('maxDistance')
        const parsed = raw != null ? Number(raw) : NaN
        const maxDistance = Number.isFinite(parsed) ? parsed : 0.01

        const {results} = await findSimilarAssetIds(params.id, maxDistance)
        return Response.json({results})
      }),
    },
  },
})
