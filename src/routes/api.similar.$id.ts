import {createFileRoute} from '@tanstack/react-router'
import {z} from 'zod'
import {db} from '../db'
import {sql} from 'kysely'

export const Route = createFileRoute('/api/similar/$id')({
  validateSearch: z.object({
    maxDistance: z.number().optional(),
  }),
  server: {
    handlers: {
      GET: async ({params}) => {
        const assetId = params.id
        const maxDistance = 0.01
        const probes = 1

        const results = await db.transaction().execute(async (trx) => {
          await sql`set local vchordrq.probes = ${sql.lit(probes)}`.execute(trx)

          // Look up the source embedding (cast number[] -> vector at call time).
          const source = await trx
            .selectFrom('smart_search')
            .select('embedding')
            .where('assetId', '=', assetId)
            .executeTakeFirstOrThrow()

          return trx
            .with('cte', (qb) =>
              qb
                .selectFrom('asset')
                .innerJoin('smart_search', 'asset.id', 'smart_search.assetId')
                .select([
                  'asset.id as assetId',
                  sql<number>`smart_search.embedding <=> ${source.embedding}`.as(
                    'distance',
                  ),
                ])
                .where('asset.deletedAt', 'is', null)
                .where('asset.id', '!=', assetId)
                .orderBy('distance')
                .limit(64),
            )
            .selectFrom('cte')
            .selectAll()
            .where('cte.distance', '<=', maxDistance)
            .execute()
        })

        return Response.json({results})
      },
    },
  },
})
