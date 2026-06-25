import '@tanstack/react-start/server-only'
import {sql} from 'kysely'
import {db} from './db'
import type {ComparisonAsset} from '../assetComparison'

export interface SimilarAssetResult {
  assetId: string
  originalPath: string
  distance: number
}

export interface SimilarAssetSearchResult {
  sourceHasEmbedding: boolean
  results: SimilarAssetResult[]
}

export async function findAssetIdByOriginalPath(
  originalPath: string,
): Promise<{assetId: string} | {error: 'not_found' | 'ambiguous'}> {
  const rows = await db
    .selectFrom('asset')
    .select('id')
    .where('originalPath', '=', originalPath)
    .where('deletedAt', 'is', null)
    .limit(2)
    .execute()

  if (rows.length === 0) return {error: 'not_found'}
  if (rows.length > 1) return {error: 'ambiguous'}
  return {assetId: rows[0].id}
}

export async function findOriginalPathByAssetId(
  assetId: string,
): Promise<string | null> {
  const row = await db
    .selectFrom('asset')
    .select('originalPath')
    .where('id', '=', assetId)
    .where('deletedAt', 'is', null)
    .executeTakeFirst()

  return row?.originalPath ?? null
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

/**
 * Comparison/review metadata read straight from the database, so it works for
 * assets owned by ANY Immich user — the single API key can only see its own
 * user's assets. Returns a map keyed by asset id; ids not found (or deleted)
 * are omitted. Postgres types are normalised to the AssetResponseDto shape the
 * comparison table expects (timestamps → ISO strings, bigint size → number).
 */
export async function getComparisonAssetsByIds(
  ids: string[],
): Promise<Map<string, ComparisonAsset>> {
  if (ids.length === 0) return new Map()

  const rows = await db
    .selectFrom('asset')
    .leftJoin('asset_exif', 'asset_exif.assetId', 'asset.id')
    .select([
      'asset.id as id',
      'asset.originalPath as originalPath',
      'asset.originalFileName as originalFileName',
      'asset.localDateTime as localDateTime',
      'asset_exif.exifImageWidth as exifImageWidth',
      'asset_exif.exifImageHeight as exifImageHeight',
      'asset_exif.fileSizeInByte as fileSizeInByte',
      'asset_exif.dateTimeOriginal as dateTimeOriginal',
      'asset_exif.make as make',
      'asset_exif.model as model',
      'asset_exif.lensModel as lensModel',
      'asset_exif.focalLength as focalLength',
      'asset_exif.fNumber as fNumber',
      'asset_exif.city as city',
      'asset_exif.state as state',
      'asset_exif.country as country',
      'asset_exif.latitude as latitude',
      'asset_exif.longitude as longitude',
    ])
    .where('asset.id', 'in', ids)
    .where('asset.deletedAt', 'is', null)
    .execute()

  return new Map<string, ComparisonAsset>(
    rows.map((r): [string, ComparisonAsset] => [
      r.id,
      {
        id: r.id,
        originalPath: r.originalPath,
        originalFileName: r.originalFileName,
        localDateTime: toIso(r.localDateTime) ?? '',
        exifInfo: {
          exifImageWidth: r.exifImageWidth,
          exifImageHeight: r.exifImageHeight,
          fileSizeInByte:
            r.fileSizeInByte != null ? Number(r.fileSizeInByte) : null,
          dateTimeOriginal: toIso(r.dateTimeOriginal),
          make: r.make,
          model: r.model,
          lensModel: r.lensModel,
          focalLength: r.focalLength,
          fNumber: r.fNumber,
          city: r.city,
          state: r.state,
          country: r.country,
          latitude: r.latitude,
          longitude: r.longitude,
        },
      },
    ]),
  )
}

/**
 * Path to Immich's pre-generated thumbnail file (webp) for an asset, as stored
 * by Immich in `asset_file`. Used to serve thumbnails from disk when the API
 * key cannot (assets owned by other users).
 */
export async function findThumbnailPathByAssetId(
  assetId: string,
): Promise<string | null> {
  const row = await db
    .selectFrom('asset_file')
    .select('path')
    .where('assetId', '=', assetId)
    .where('type', '=', 'thumbnail')
    .where('isEdited', '=', false)
    .executeTakeFirst()

  return row?.path ?? null
}

export function getNikonLowResAssets() {
  return db
    .selectFrom('asset')
    .select(['asset.id', 'asset.originalPath'])
    .where('asset.originalPath', 'like', '%to-sort/nikon-low-res%')
    .where('asset.deletedAt', 'is', null)
    .orderBy('asset.id')
    .execute()
}

export async function findSimilarAssetIds(
  assetId: string,
  maxDistance = 0.01,
): Promise<SimilarAssetSearchResult> {
  const source = await db
    .selectFrom('smart_search')
    .select('embedding')
    .where('assetId', '=', assetId)
    .executeTakeFirst()

  if (!source) return {sourceHasEmbedding: false, results: []}

  const results = await db
    .with('cte', (qb) =>
      qb
        .selectFrom('asset')
        .innerJoin('smart_search', 'asset.id', 'smart_search.assetId')
        .select([
          'asset.id as assetId',
          'asset.originalPath as originalPath',
          sql<number>`smart_search.embedding <=> ${source.embedding}`.as(
            'distance',
          ),
        ])
        .where('asset.deletedAt', 'is', null)
        .where('asset.id', '!=', assetId),
    )
    .selectFrom('cte')
    .selectAll()
    .where('cte.distance', '<=', maxDistance)
    .orderBy('distance')
    .execute()

  return {sourceHasEmbedding: true, results}
}

/** Vector distance from a reference asset to each of the given asset ids.
 *  Returns assetId → cosine distance (ids without an embedding are omitted). */
export async function distancesFromReference(
  referenceId: string,
  otherIds: string[],
): Promise<Record<string, number>> {
  if (otherIds.length === 0) return {}

  const reference = await db
    .selectFrom('smart_search')
    .select('embedding')
    .where('assetId', '=', referenceId)
    .executeTakeFirst()

  if (!reference) return {}

  const rows = await db
    .selectFrom('smart_search')
    .select([
      'assetId',
      sql<number>`embedding <=> ${reference.embedding}`.as('distance'),
    ])
    .where('assetId', 'in', otherIds)
    .execute()

  return Object.fromEntries(rows.map((r) => [r.assetId, r.distance]))
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
