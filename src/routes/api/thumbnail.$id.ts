import {createFileRoute} from '@tanstack/react-router'
import {AssetMediaSize, viewAsset} from '@immich/sdk'
import {ensureImmichInit} from '../../lib/server/immich'
import {
  createLogger,
  errorContext,
  withRequestLogging,
} from '../../lib/server/logger'

const log = createLogger('api:thumbnail')

export const Route = createFileRoute('/api/thumbnail/$id')({
  server: {
    handlers: {
      GET: withRequestLogging('api:thumbnail', async ({params}) => {
        ensureImmichInit()
        try {
          const blob = await viewAsset({
            id: params.id,
            size: AssetMediaSize.Thumbnail,
          })
          return new Response(blob, {
            headers: {
              'Content-Type': blob.type || 'image/jpeg',
              'Cache-Control': 'private, max-age=3600',
            },
          })
        } catch (err) {
          log.warn('Thumbnail not found', {
            assetId: params.id,
            ...errorContext(err),
          })
          return new Response('Thumbnail not found', {status: 404})
        }
      }),
    },
  },
})
