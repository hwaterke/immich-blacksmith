import {createFileRoute} from '@tanstack/react-router'
import {db} from '../db'

export const Route = createFileRoute('/assets')({
  server: {
    handlers: {
      GET: async () => {
        // Return total number of assets
        const totalAssets = await db
          .selectFrom('asset')
          .select(({fn}) => [fn.count('asset.id').as('total_assets')])
          .execute()
        return Response.json({totalAssets})
      },
    },
  },
})
