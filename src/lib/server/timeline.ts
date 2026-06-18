import '@tanstack/react-start/server-only'
import {Buffer} from 'node:buffer'
import {sql} from 'kysely'
import type {Kysely, SelectQueryBuilder, SqlBool} from 'kysely'
import {db} from './db'
import type {DB} from './db.d'
import type {CombinedFilter} from '../shared/searchTypes'
import type {
  TimeBucket,
  TimeBucketAssets,
  TimelineBucketRequest,
  TimelineBucketsRequest,
} from '../shared/timelineTypes'
import {
  buildCombined,
  collectFields,
  exifFilterFields,
  type SearchEB,
} from './search'

/** The month a bucket groups by. Identical expression on both endpoints so
 *  bucket counts and the rendered asset arrays always agree. */
const monthExpr = sql<Date>`date_trunc('month', "asset"."localDateTime")`

/** True when the filter tree references an exif column, forcing the lazy
 *  asset_exif left join (same rule as search.ts's needsExifJoin). */
const needsExif = (filters: CombinedFilter): boolean => {
  for (const field of collectFields(filters)) {
    if (exifFilterFields.has(field)) {
      return true
    }
  }
  return false
}

/**
 * Shared FROM/WHERE for both endpoints: the asset table, the stack-collapse
 * predicate, the lazy exif join, and the client's filter tree. The cast widens
 * scope to asset_exif for buildCombined; it is sound because the exif join is
 * gated by the same needsExif scan that decides whether any exif column is
 * referenced. `stack` is left-joined physically but kept out of the typed scope
 * — the only reference to it (the collapse predicate) is a raw SQL fragment.
 */
const baseQuery = (executor: Kysely<DB>, filters: CombinedFilter) => {
  const base = executor
    .selectFrom('asset')
    // Stack-collapse needs the primary; left join keeps non-stacked assets.
    .leftJoin('stack', 'stack.id', 'asset.stackId')
    .$if(needsExif(filters), (qb) =>
      qb.leftJoin('asset_exif', 'asset_exif.assetId', 'asset.id'),
    ) as unknown as SelectQueryBuilder<
    DB,
    'asset' | 'asset_exif',
    Record<string, never>
  >

  return (
    base
      // Collapse stacks like Immich: show only each stack's primary plus every
      // non-stacked asset. Hidden members drop out of counts AND arrays. Filters
      // are therefore evaluated against the primary (excluding a non-primary
      // member won't hide the stack; excluding the primary hides the whole stack).
      .where((eb) =>
        eb.or([
          eb('asset.stackId', 'is', null),
          sql<SqlBool>`"asset"."id" = "stack"."primaryAssetId"`,
        ]),
      )
      // No implicit status/visibility default (unlike /api/search): the timeline
      // applies exactly the client's filter. `{}` therefore means all assets.
      .where((eb) => buildCombined(eb as SearchEB, filters))
  )
}

/** SELECT … GROUP BY month, newest first. countAll is bigint → string. */
export const buildBucketsQuery = (
  executor: Kysely<DB>,
  params: TimelineBucketsRequest,
) =>
  baseQuery(executor, params.filters)
    .select(monthExpr.as('timeBucket'))
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .groupBy(monthExpr)
    .orderBy(monthExpr, 'desc')

/** Assets in one month bucket, ordered newest first with a stable id tiebreak.
 *  Carries the stackId and a correlated member count for the badge. */
export const buildBucketAssetsQuery = (
  executor: Kysely<DB>,
  params: TimelineBucketRequest,
) =>
  baseQuery(executor, params.filters)
    // Same month expression as the buckets endpoint; the round-tripped ISO
    // string binds as a param and Postgres coerces it to the timestamp type.
    .where(
      sql<SqlBool>`date_trunc('month', "asset"."localDateTime") = ${params.timeBucket}`,
    )
    .select([
      'asset.id',
      'asset.thumbhash',
      'asset.type',
      'asset.duration',
      'asset.stackId',
    ])
    .select((eb) =>
      eb
        .selectFrom('asset as member')
        .select(eb.fn.countAll<string>().as('c'))
        .whereRef('member.stackId', '=', 'asset.stackId')
        .as('stackCount'),
    )
    .orderBy('asset.localDateTime', 'desc')
    .orderBy('asset.id')

/** All month buckets for the given filter, newest first. */
export async function getTimelineBuckets(
  params: TimelineBucketsRequest,
): Promise<TimeBucket[]> {
  const rows = await buildBucketsQuery(db, params).execute()
  return rows.map((row) => ({
    // date_trunc returns a Date; ISO string round-trips back as `timeBucket`.
    timeBucket: (row.timeBucket as Date).toISOString(),
    count: Number(row.count),
  }))
}

/** One month bucket, pivoted from rows into the columnar payload the app
 *  renders. thumbhash (bytea) is base64-encoded so it survives JSON. */
export async function getTimelineBucketAssets(
  params: TimelineBucketRequest,
): Promise<TimeBucketAssets> {
  const rows = await buildBucketAssetsQuery(db, params).execute()

  const result: TimeBucketAssets = {
    id: [],
    thumbhash: [],
    type: [],
    duration: [],
    stack: [],
  }
  for (const row of rows) {
    result.id.push(row.id)
    result.thumbhash.push(
      row.thumbhash ? Buffer.from(row.thumbhash).toString('base64') : null,
    )
    result.type.push(row.type)
    result.duration.push(row.duration)
    result.stack.push(
      row.stackId ? [row.stackId, Number(row.stackCount)] : null,
    )
  }
  return result
}
