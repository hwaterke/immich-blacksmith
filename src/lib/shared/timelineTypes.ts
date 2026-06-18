import {z} from 'zod'
import {combinedFilterSchema} from './searchTypes'

// The timeline reuses the full search filter tree (see searchTypes.ts), so
// "exclude album X / person Y" is just
// {not: {or: [{albumIds: {any: [X]}}, {personIds: {any: [Y]}}]}}.
//
// Unlike searchSchema, these schemas do NOT inject a status default: the
// timeline applies exactly the client's filter, nothing implicit. An empty
// `filters: {}` therefore means *all* assets, trashed/archived included — the
// client is responsible for sending status/visibility predicates.
//
// This file imports only zod + combinedFilterSchema, so it can be copied
// verbatim into the React Native app like searchTypes.ts.

export const timelineBucketsRequestSchema = z.object({
  filters: combinedFilterSchema,
})

export const timelineBucketRequestSchema = z.object({
  // Month-start ISO string, e.g. "2024-03-01T00:00:00.000Z", round-tripped from
  // the buckets endpoint back into this one.
  timeBucket: z.string(),
  filters: combinedFilterSchema,
})

export type TimelineBucketsRequest = z.infer<
  typeof timelineBucketsRequestSchema
>
export type TimelineBucketRequest = z.infer<typeof timelineBucketRequestSchema>

/** One month bucket and how many (stack-collapsed) assets it holds. */
export type TimeBucket = {timeBucket: string; count: number}

/**
 * Columnar bucket payload: parallel arrays, all the same length, one entry per
 * shown asset (stack primaries + non-stacked assets). Immich's
 * TimeBucketAssetResponseDto shape, trimmed to the fields the app renders.
 */
export type TimeBucketAssets = {
  id: string[]
  thumbhash: (string | null)[] // base64
  type: string[] // 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER'
  duration: (string | null)[] // 'HH:MM:SS.ssssss' for video, null otherwise
  // [stackId, memberCount] when the asset is a stack primary, else null.
  stack: ([string, number] | null)[]
}
