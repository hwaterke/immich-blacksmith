import {z} from 'zod'

// `eq: null` / `ne: null` express IS NULL / IS NOT NULL.
// `z.coerce.date()` would coerce null to 1970-01-01, hence the explicit unions.
const nullableDate = z.union([z.null(), z.coerce.date()])

const idFilterSchema = z.strictObject({
  eq: z.uuid().nullable().optional().describe('Equals a specific ID'),
  ne: z.uuid().nullable().optional().describe('Not equal to a specific ID'),
  any: z.array(z.uuid()).min(1).optional().describe('In a list of IDs'),
  none: z.array(z.uuid()).min(1).optional().describe('Not in a list of IDs'),
})

const idsFilterSchema = z.strictObject({
  any: z
    .array(z.uuid())
    .min(1)
    .optional()
    .describe('Linked to at least one of these IDs'),
  all: z
    .array(z.uuid())
    .min(1)
    .optional()
    .describe('Linked to all of these IDs'),
  none: z
    .array(z.uuid())
    .min(1)
    .optional()
    .describe('Linked to none of these IDs'),
})

const stringFilterSchema = z.strictObject({
  eq: z
    .string()
    .trim()
    .nullable()
    .optional()
    .describe('Equals a specific string'),
  ne: z
    .string()
    .trim()
    .nullable()
    .optional()
    .describe('Not equal to a specific string'),
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
})

// Pattern operators are case-insensitive (ILIKE).
const stringPatternFilterSchema = stringFilterSchema.extend({
  contains: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Contains a substring (case-insensitive)'),
  startsWith: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Starts with a substring (case-insensitive)'),
  endsWith: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Ends with a substring (case-insensitive)'),
})

const dateFilterSchema = z.strictObject({
  eq: nullableDate.optional().describe('Equals a specific date'),
  ne: nullableDate.optional().describe('Not equal to a specific date'),
  gt: z.coerce.date().optional().describe('After a specific date'),
  lt: z.coerce.date().optional().describe('Before a specific date'),
  gte: z.coerce.date().optional().describe('On or after a specific date'),
  lte: z.coerce.date().optional().describe('On or before a specific date'),
})

const enumFilterSchema = <const T extends readonly [string, ...string[]]>(
  values: T,
) =>
  z.strictObject({
    eq: z.enum(values).optional().describe('Equals a specific value'),
    ne: z.enum(values).optional().describe('Not equal to a specific value'),
    any: z
      .array(z.enum(values))
      .min(1)
      .optional()
      .describe('In a list of values'),
    none: z
      .array(z.enum(values))
      .min(1)
      .optional()
      .describe('Not in a list of values'),
  })

export const filterSchema = z.strictObject({
  id: idFilterSchema.optional().describe('Filter by asset ID'),
  libraryId: idFilterSchema.optional().describe('Filter by library ID'),
  isEncoded: z.boolean().optional().describe('Filter by encoded status'),
  isFavorite: z.boolean().optional().describe('Filter by favorite status'),
  isMotion: z.boolean().optional().describe('Filter by motion photo status'),
  isOffline: z.boolean().optional().describe('Filter by offline status'),
  visibility: enumFilterSchema(['archive', 'timeline', 'hidden', 'locked'])
    .optional()
    .describe('Filter by visibility'),
  type: enumFilterSchema(['IMAGE', 'VIDEO', 'AUDIO', 'OTHER'])
    .optional()
    .describe('Filter by asset type'),
  city: stringPatternFilterSchema.optional().describe('Filter by city name'),
  state: stringPatternFilterSchema
    .optional()
    .describe('Filter by state/province name'),
  country: stringPatternFilterSchema
    .optional()
    .describe('Filter by country name'),
  make: stringPatternFilterSchema.optional().describe('Filter by camera make'),
  model: stringPatternFilterSchema
    .optional()
    .describe('Filter by camera model'),
  lensModel: stringPatternFilterSchema
    .optional()
    .describe('Filter by lens model'),
  description: stringPatternFilterSchema
    .optional()
    .describe('Filter by description text'),
  checksum: stringFilterSchema.optional().describe('Filter by file checksum'),
  originalFileName: stringPatternFilterSchema
    .optional()
    .describe('Filter by original file name'),
  originalPath: stringPatternFilterSchema
    .optional()
    .describe('Filter by original file path'),
  previewPath: stringPatternFilterSchema
    .optional()
    .describe('Filter by preview file path'),
  thumbnailPath: stringPatternFilterSchema
    .optional()
    .describe('Filter by thumbnail file path'),
  encodedVideoPath: stringPatternFilterSchema
    .optional()
    .describe('Filter by encoded video file path'),
  albumIds: idsFilterSchema.optional().describe('Filter by album membership'),
  personIds: idsFilterSchema.optional().describe('Filter by recognized people'),
  tagIds: idsFilterSchema.optional().describe('Filter by tags'),
  ownerIds: idsFilterSchema.optional().describe('Filter by asset owner'),
  createdAt: dateFilterSchema
    .optional()
    .describe('Filter by creation date (database record)'),
  updatedAt: dateFilterSchema.optional().describe('Filter by update date'),
  trashedAt: dateFilterSchema.optional().describe('Filter by trash date'),
  takenAt: dateFilterSchema
    .optional()
    .describe('Filter by date taken (EXIF dateTimeOriginal)'),
  fileCreatedAt: dateFilterSchema
    .optional()
    .describe('Filter by file creation date'),
  fileModifiedAt: dateFilterSchema
    .optional()
    .describe('Filter by file modification date'),
  localDateTime: dateFilterSchema
    .optional()
    .describe('Filter by local date and time'),
  ocr: z.string().trim().optional().describe('Filter by OCR text content'),
})

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
export type Filter = z.infer<typeof filterSchema>
export type CombinedFilter = z.infer<typeof combinedFilterSchema>
