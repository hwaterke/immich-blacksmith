import {sql} from 'kysely'
import {db} from '../db'

export interface SimilarAssetResult {
  assetId: string
  distance: number
}

export interface SimilarAssetSearchResult {
  sourceHasEmbedding: boolean
  results: SimilarAssetResult[]
}

export function getNikonLowResAssets() {
  return db
    .selectFrom('asset')
    .select(['asset.id', 'asset.originalPath'])
    .where('asset.originalPath', 'like', '%to-sort/nikon-low-res%')
    .orderBy('asset.id')
    .execute()
}

export async function findSimilarAssetIds(
  assetId: string,
  maxDistance = 0.01,
): Promise<SimilarAssetSearchResult> {
  const probes = 1

  return db.transaction().execute(async (trx) => {
    await sql`set local vchordrq.probes = ${sql.lit(probes)}`.execute(trx)

    const source = await trx
      .selectFrom('smart_search')
      .select('embedding')
      .where('assetId', '=', assetId)
      .executeTakeFirst()

    if (!source) return {sourceHasEmbedding: false, results: []}

    const results = await trx
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

    return {sourceHasEmbedding: true, results}
  })
}

export function assetDistance(assetId1: string, assetId2: string) {
  const probes = 1

  return db.transaction().execute(async (trx) => {
    await sql`set local vchordrq.probes = ${sql.lit(probes)}`.execute(trx)

    const embedding1 = await trx
      .selectFrom('smart_search')
      .select('embedding')
      .where('assetId', '=', assetId1)
      .executeTakeFirst()

    const embedding2 = await trx
      .selectFrom('smart_search')
      .select('embedding')
      .where('assetId', '=', assetId2)
      .executeTakeFirst()

    if (!embedding1 || !embedding2) return null

    const result = await sql<{distance: number}>`
      select ${embedding1.embedding}::vector <=> ${embedding2.embedding}::vector as distance
    `.execute(trx)

    return result.rows[0]?.distance ?? null
  })
}
