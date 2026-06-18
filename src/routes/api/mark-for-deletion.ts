import {createFileRoute} from '@tanstack/react-router'
import {appendFile, mkdir} from 'node:fs/promises'
import {dirname} from 'node:path'
import {z} from 'zod'
import {createLogger, withRequestLogging} from '../../lib/server/logger'

const log = createLogger('api:mark-for-deletion')

const DELETION_LOG_PATH = './data/assets-to-delete.txt'

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

        await mkdir(dirname(DELETION_LOG_PATH), {recursive: true})
        await appendFile(DELETION_LOG_PATH, parsed.data.originalPath + '\n')
        log.info('Marked asset for deletion', {
          originalPath: parsed.data.originalPath,
        })

        return Response.json({ok: true})
      }),
    },
  },
})
