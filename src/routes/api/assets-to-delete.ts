import {createFileRoute} from '@tanstack/react-router'
import {
  clearDeletionList,
  readDeletionList,
} from '../../lib/server/deletionList'
import {createLogger, withRequestLogging} from '../../lib/server/logger'

const log = createLogger('api:assets-to-delete')

export const Route = createFileRoute('/api/assets-to-delete')({
  server: {
    handlers: {
      GET: withRequestLogging('api:assets-to-delete', async () => {
        const entries = await readDeletionList()
        return new Response(entries.join('\n'), {
          headers: {'Content-Type': 'text/plain; charset=utf-8'},
        })
      }),
      DELETE: withRequestLogging('api:assets-to-delete:clear', async () => {
        const removed = await clearDeletionList()
        log.info('Cleared deletion list', {removed})
        return Response.json({removed})
      }),
    },
  },
})
