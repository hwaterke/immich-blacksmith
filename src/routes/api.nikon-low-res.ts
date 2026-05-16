import {createFileRoute} from '@tanstack/react-router'
import {db} from '../db'

export const Route = createFileRoute('/api/nikon-low-res')({
  server: {
    handlers: {
      GET: async () => {
        const lowResAssets = await db
          .selectFrom('asset')
          .select(['asset.id', 'asset.originalPath'])
          .where('asset.originalPath', 'like', '%to-sort/nikon-low-res%')
          .execute()

        return Response.json({lowResAssets})
      },
    },
  },
})
