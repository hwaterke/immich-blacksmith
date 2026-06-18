import {createFileRoute} from '@tanstack/react-router'
import {Buffer} from 'node:buffer'
import {searchSchema} from '../../lib/shared/searchTypes'
import {searchAssets} from '../../lib/server/search'
import {createLogger, withRequestLogging} from '../../lib/server/logger'

const log = createLogger('api:search')

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      POST: withRequestLogging('api:search', async ({request}) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          log.warn('Invalid JSON body')
          return Response.json({error: 'Invalid JSON body'}, {status: 400})
        }

        const parsed = searchSchema.safeParse(body)
        if (!parsed.success) {
          log.warn('Invalid body', {issues: parsed.error.issues})
          return Response.json(
            {error: 'Invalid body', issues: parsed.error.issues},
            {status: 400},
          )
        }

        const {items, hasNextPage} = await searchAssets(parsed.data)

        // checksum (Buffer) is dropped; thumbhash (Buffer) is base64-encoded so
        // it survives JSON and is usable as a blur placeholder on the client.
        const cleaned = items.map(
          ({checksum: _checksum, thumbhash, ...rest}) => ({
            ...rest,
            thumbhash: thumbhash
              ? Buffer.from(thumbhash).toString('base64')
              : null,
          }),
        )

        return Response.json({items: cleaned, hasNextPage})
      }),
    },
  },
})
