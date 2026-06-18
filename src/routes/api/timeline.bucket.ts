import {createFileRoute} from '@tanstack/react-router'
import {timelineBucketRequestSchema} from '../../lib/shared/timelineTypes'
import {getTimelineBucketAssets} from '../../lib/server/timeline'
import {createLogger, withRequestLogging} from '../../lib/server/logger'

const log = createLogger('api:timeline:bucket')

export const Route = createFileRoute('/api/timeline/bucket')({
  server: {
    handlers: {
      POST: withRequestLogging('api:timeline:bucket', async ({request}) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          log.warn('Invalid JSON body')
          return Response.json({error: 'Invalid JSON body'}, {status: 400})
        }

        const parsed = timelineBucketRequestSchema.safeParse(body)
        if (!parsed.success) {
          log.warn('Invalid body', {issues: parsed.error.issues})
          return Response.json(
            {error: 'Invalid body', issues: parsed.error.issues},
            {status: 400},
          )
        }

        const assets = await getTimelineBucketAssets(parsed.data)
        return Response.json(assets)
      }),
    },
  },
})
