import {createFileRoute} from '@tanstack/react-router'
import {AssetMediaSize, viewAsset} from '@immich/sdk'
import {ensureImmichInit} from '../../lib/immich'

export const Route = createFileRoute('/api/thumbnail/$id')({
  server: {
    handlers: {
      GET: async ({params}) => {
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
        } catch {
          return new Response('Thumbnail not found', {status: 404})
        }
      },
    },
  },
})
