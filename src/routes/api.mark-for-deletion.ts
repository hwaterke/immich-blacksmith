import {createFileRoute} from '@tanstack/react-router'
import {appendFile, mkdir} from 'node:fs/promises'
import {dirname} from 'node:path'
import {z} from 'zod'

const DELETION_LOG_PATH = './data/assets-to-delete.txt'

const BodySchema = z.object({
  originalPath: z.string().min(1),
})

export const Route = createFileRoute('/api/mark-for-deletion')({
  server: {
    handlers: {
      POST: async ({request}) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({error: 'Invalid JSON body'}, {status: 400})
        }

        const parsed = BodySchema.safeParse(body)
        if (!parsed.success) {
          return Response.json(
            {error: 'Invalid body', issues: parsed.error.issues},
            {status: 400},
          )
        }

        await mkdir(dirname(DELETION_LOG_PATH), {recursive: true})
        await appendFile(DELETION_LOG_PATH, parsed.data.originalPath + '\n')

        return Response.json({ok: true})
      },
    },
  },
})
