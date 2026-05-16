import {createFileRoute} from '@tanstack/react-router'
import {assetDistance} from '../lib/assetQueries'

export const Route = createFileRoute('/api/try/$id/$id2')({
  server: {
    handlers: {
      GET: async ({params}) => {
        const distance = await assetDistance(params.id, params.id2)
        return Response.json({distance})
      },
    },
  },
})
