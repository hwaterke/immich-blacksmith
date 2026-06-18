import {createFileRoute} from '@tanstack/react-router'
import {getNikonLowResAssets} from '../../lib/server/assetQueries'
import {withRequestLogging} from '../../lib/server/logger'

export const Route = createFileRoute('/api/nikon-low-res')({
  server: {
    handlers: {
      GET: withRequestLogging('api:nikon-low-res', async () => {
        const lowResAssets = await getNikonLowResAssets()
        return Response.json({lowResAssets})
      }),
    },
  },
})
