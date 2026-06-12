import {z} from 'zod'

const idFilterSchema = z.object({
  eq: z.uuid().optional().describe('Equals a specific ID'),
  ne: z.uuid().optional().describe('Not equal to a specific ID'),
})

const idsFilterSchema = z.object({
  any: z.array(z.uuid()).min(1).optional().describe('In a list of IDs'),
  all: z.array(z.uuid()).min(1).optional().describe('In a list of IDs'),
  none: z.array(z.uuid()).min(1).optional().describe('Not in a list of IDs'),
})

const stringPatternFilterSchema = z.object({
  eq: z.string().trim().optional().describe('Equals a specific string'),
  ne: z.string().trim().optional().describe('Not equal to a specific string'),
  any: z
    .array(z.string().trim())
    .min(1)
    .optional()
    .describe('In a list of strings'),
  none: z
    .array(z.string().trim())
    .min(1)
    .optional()
    .describe('Not in a list of strings'),
  contains: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Contains a substring'),
  startsWith: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Starts with a substring'),
  endsWith: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Ends with a substring'),
})

const dateFilterSchema = z.object({
  eq: z.coerce.date().optional().describe('Equals a specific date'),
  ne: z.coerce.date().optional().describe('Not equal to a specific date'),
  gt: z.coerce.date().optional().describe('After a specific date'),
  lt: z.coerce.date().optional().describe('Before a specific date'),
  gte: z.coerce.date().optional().describe('On or after a specific date'),
  lte: z.coerce.date().optional().describe('On or before a specific date'),
})

export const filterSchema = z.strictObject({
  id: idFilterSchema.optional().describe('Filter by asset ID'),
  libraryId: idFilterSchema.optional().describe('Filter by library ID'),
  isEncoded: z.boolean().optional().describe('Filter by encoded status'),
  isFavorite: z.boolean().optional().describe('Filter by favorite status'),
  isMotion: z.boolean().optional().describe('Filter by motion photo status'),
  isOffline: z.boolean().optional().describe('Filter by offline status'),
  visibility: z
    .enum(['archive', 'timeline', 'hidden', 'locked'])
    .optional()
    .describe('Filter by visibility'),
  city: z.string().trim().optional().describe('Filter by city name'),
  state: z.string().trim().optional().describe('Filter by state/province name'),
  country: z.string().trim().optional().describe('Filter by country name'),
  make: z.string().trim().optional().describe('Filter by camera make'),
  model: z.string().trim().optional().describe('Filter by camera model'),
  lensModel: z.string().trim().optional().describe('Filter by lens model'),
  description: z
    .string()
    .trim()
    .optional()
    .describe('Filter by description text'),
  checksum: z.string().optional().describe('Filter by file checksum'),
  originalFileName: z
    .string()
    .trim()
    .optional()
    .describe('Filter by original file name'),
  originalPath: z.string().optional().describe('Filter by original file path'),
  previewPath: z.string().optional().describe('Filter by preview file path'),
  thumbnailPath: z
    .string()
    .optional()
    .describe('Filter by thumbnail file path'),
  encodedVideoPath: z
    .string()
    .optional()
    .describe('Filter by encoded video file path'),
  albumId: z.uuid().optional().describe('Filter by album ID'),
  personId: z.uuid().optional().describe('Filter by person ID'),
  tagId: z.uuid().optional().describe('Filter by tag ID'),
  type: z
    .enum(['IMAGE', 'VIDEO', 'AUDIO', 'OTHER'])
    .optional()
    .describe('Filter by asset type'),
  userIds: z.array(z.uuid()).optional().describe('Filter by user IDs'),
  ocr: z.string().trim().optional().describe('Filter by OCR text content'),
})

/*
  createdBefore: isoDatetimeToDate.optional().describe('Filter by creation date (before)'),
  createdAfter: isoDatetimeToDate.optional().describe('Filter by creation date (after)'),
  updatedBefore: isoDatetimeToDate.optional().describe('Filter by update date (before)'),
  updatedAfter: isoDatetimeToDate.optional().describe('Filter by update date (after)'),
  trashedBefore: isoDatetimeToDate.optional().describe('Filter by trash date (before)'),
  trashedAfter: isoDatetimeToDate.optional().describe('Filter by trash date (after)'),
  takenBefore: isoDatetimeToDate.optional().describe('Filter by taken date (before)'),
  takenAfter: isoDatetimeToDate.optional().describe('Filter by taken date (after)'),
*/

export const combinedFilterSchema = z.union([
  filterSchema,
  z.strictObject({
    get and() {
      return z.array(combinedFilterSchema)
    },
  }),
  z.strictObject({
    get or() {
      return z.array(combinedFilterSchema)
    },
  }),
  z.strictObject({
    get not() {
      return combinedFilterSchema
    },
  }),
])

export const searchSchema = z.object({
  filters: combinedFilterSchema,
  joins: z.array(z.enum(['exif', 'person', 'stack'])).default([]),
  sort: z.object({
    field: z.enum(['fileCreatedAt']).default('fileCreatedAt'),
    direction: z.enum(['asc', 'desc']).default('desc'),
  }),
  pagination: z.object({
    page: z.number().int().min(1).default(1).catch(1),
    size: z.number().int().min(1).max(100).default(10).catch(10),
  }),
})

export type SearchParams = z.infer<typeof searchSchema>
