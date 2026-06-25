import {createFileRoute} from '@tanstack/react-router'
import {z} from 'zod'
import {addToDeletionList} from '../../lib/server/deletionList'
import {createLogger, withRequestLogging} from '../../lib/server/logger'

const log = createLogger('api:mark-for-deletion')

const BodySchema = z.object({
  originalPath: z.string().min(1),
})

export const Route = createFileRoute('/api/mark-for-deletion')({
  server: {
    handlers: {
      POST: withRequestLogging('api:mark-for-deletion', async ({request}) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          log.warn('Invalid JSON body')
          return Response.json({error: 'Invalid JSON body'}, {status: 400})
        }

        const parsed = BodySchema.safeParse(body)
        if (!parsed.success) {
          log.warn('Invalid body', {issues: parsed.error.issues})
          return Response.json(
            {error: 'Invalid body', issues: parsed.error.issues},
            {status: 400},
          )
        }

        await addToDeletionList(parsed.data.originalPath)
        log.info('Marked asset for deletion', {
          originalPath: parsed.data.originalPath,
        })

        return Response.json({ok: true})
      }),
    },
  },
})
