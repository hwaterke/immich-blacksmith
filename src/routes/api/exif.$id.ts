import {createFileRoute} from '@tanstack/react-router'
import {readExifForAsset} from '../../lib/exifLoader'

export const Route = createFileRoute('/api/exif/$id')({
  server: {
    handlers: {
      GET: async ({params}) => {
        const result = await readExifForAsset(params.id)
        if ('error' in result) {
          const status = result.error === 'Asset not found' ? 404 : 400
          return Response.json(result, {status})
        }
        return Response.json(result)
      },
    },
  },
})
