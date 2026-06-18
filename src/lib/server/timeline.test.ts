import {describe, expect, it} from 'vitest'
import {db} from './db'
import {
  timelineBucketRequestSchema,
  timelineBucketsRequestSchema,
} from '../shared/timelineTypes'
import {buildBucketAssetsQuery, buildBucketsQuery} from './timeline'

// RFC-shaped v4 UUIDs (zod v4 validates the version/variant nibbles).
const album = '11111111-1111-4111-8111-111111111111'
const person = '22222222-2222-4222-9222-222222222222'

// Pure unit tests: Kysely's `.compile()` produces SQL + params without a DB.
const compileBuckets = (params: unknown) =>
  buildBucketsQuery(db, timelineBucketsRequestSchema.parse(params)).compile()
const compileBucket = (params: unknown) =>
  buildBucketAssetsQuery(
    db,
    timelineBucketRequestSchema.parse(params),
  ).compile()

describe('buildBucketsQuery', () => {
  it('groups and orders by month of localDateTime, newest first', () => {
    const {sql} = compileBuckets({filters: {}})
    expect(sql).toContain(
      `date_trunc('month', "asset"."localDateTime") as "timeBucket"`,
    )
    expect(sql).toContain('count(*) as "count"')
    expect(sql).toContain(
      `group by date_trunc('month', "asset"."localDateTime")`,
    )
    expect(sql).toContain(
      `order by date_trunc('month', "asset"."localDateTime") desc`,
    )
  })

  it('left joins stack and applies the stack-collapse predicate', () => {
    const {sql} = compileBuckets({filters: {}})
    expect(sql).toContain(
      'left join "stack" on "stack"."id" = "asset"."stackId"',
    )
    expect(sql).toContain(
      '("asset"."stackId" is null or "asset"."id" = "stack"."primaryAssetId")',
    )
  })

  it('injects no status default (empty filter is the always-true 1 = 1)', () => {
    const {sql} = compileBuckets({filters: {}})
    expect(sql).toContain('1 = 1')
    expect(sql).not.toContain('"status"')
  })

  it('adds no exif join when the filter references no exif column', () => {
    const {sql} = compileBuckets({filters: {isFavorite: true}})
    expect(sql).not.toContain('asset_exif')
  })

  it('left joins asset_exif when the filter references an exif column', () => {
    const {sql} = compileBuckets({filters: {city: {eq: 'Paris'}}})
    expect(sql).toContain(
      'left join "asset_exif" on "asset_exif"."assetId" = "asset"."id"',
    )
  })

  it('compiles an album/person exclusion to negated EXISTS subqueries', () => {
    const {sql} = compileBuckets({
      filters: {
        not: {
          or: [{albumIds: {any: [album]}}, {personIds: {any: [person]}}],
        },
      },
    })
    expect(sql).toContain('not (exists')
    expect(sql).toContain('from "album_asset"')
    expect(sql).toContain('from "asset_face"')
  })
})

describe('buildBucketAssetsQuery', () => {
  const bucket = '2024-03-01T00:00:00.000Z'

  it('filters to the requested month bucket', () => {
    const {sql, parameters} = compileBucket({timeBucket: bucket, filters: {}})
    expect(sql).toContain(`date_trunc('month', "asset"."localDateTime") = $1`)
    expect(parameters).toContain(bucket)
  })

  it('orders newest first with a stable id tiebreak', () => {
    const {sql} = compileBucket({timeBucket: bucket, filters: {}})
    expect(sql).toContain('order by "asset"."localDateTime" desc, "asset"."id"')
  })

  it('selects the columnar fields and a correlated stack member count', () => {
    const {sql} = compileBucket({timeBucket: bucket, filters: {}})
    expect(sql).toContain('"asset"."id"')
    expect(sql).toContain('"asset"."thumbhash"')
    expect(sql).toContain('"asset"."type"')
    expect(sql).toContain('"asset"."duration"')
    expect(sql).toContain('where "member"."stackId" = "asset"."stackId"')
  })

  it('still applies the stack-collapse predicate', () => {
    const {sql} = compileBucket({timeBucket: bucket, filters: {}})
    expect(sql).toContain(
      '("asset"."stackId" is null or "asset"."id" = "stack"."primaryAssetId")',
    )
  })
})
