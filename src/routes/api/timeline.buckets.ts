import {createFileRoute} from '@tanstack/react-router'
import {timelineBucketsRequestSchema} from '../../lib/shared/timelineTypes'
import {getTimelineBuckets} from '../../lib/server/timeline'
import {createLogger, withRequestLogging} from '../../lib/server/logger'

const log = createLogger('api:timeline:buckets')

export const Route = createFileRoute('/api/timeline/buckets')({
  server: {
    handlers: {
      POST: withRequestLogging('api:timeline:buckets', async ({request}) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          log.warn('Invalid JSON body')
          return Response.json({error: 'Invalid JSON body'}, {status: 400})
        }

        const parsed = timelineBucketsRequestSchema.safeParse(body)
        if (!parsed.success) {
          log.warn('Invalid body', {issues: parsed.error.issues})
          return Response.json(
            {error: 'Invalid body', issues: parsed.error.issues},
            {status: 400},
          )
        }

        const buckets = await getTimelineBuckets(parsed.data)
        return Response.json(buckets)
      }),
    },
  },
})
