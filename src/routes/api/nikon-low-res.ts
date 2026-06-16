import {createFileRoute} from '@tanstack/react-router'
import {getNikonLowResAssets} from '../../lib/assetQueries'

export const Route = createFileRoute('/api/nikon-low-res')({
  server: {
    handlers: {
      GET: async () => {
        const lowResAssets = await getNikonLowResAssets()
        return Response.json({lowResAssets})
      },
    },
  },
})
