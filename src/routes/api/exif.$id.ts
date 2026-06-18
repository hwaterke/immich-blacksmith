import {createFileRoute} from '@tanstack/react-router'
import {readExifForAsset} from '../../lib/server/exifReader'
import {withRequestLogging} from '../../lib/server/logger'

const NOT_FOUND_ERRORS = new Set(['Asset not found', 'File not found on disk'])

export const Route = createFileRoute('/api/exif/$id')({
  server: {
    handlers: {
      GET: withRequestLogging('api:exif', async ({params}) => {
        const result = await readExifForAsset(params.id)
        if ('error' in result) {
          const status = NOT_FOUND_ERRORS.has(result.error) ? 404 : 400
          return Response.json(result, {status})
        }
        return Response.json(result)
      }),
    },
  },
})
