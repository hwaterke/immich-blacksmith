import {z} from 'zod'

// `z.coerce.date()` alone would coerce null (and booleans) to a valid Date,
// e.g. null -> 1970-01-01, so restrict the accepted inputs before coercing.
const dateValue = z
  .union([z.string(), z.number(), z.date()])
  .pipe(z.coerce.date())

// `eq: null` / `ne: null` express IS NULL / IS NOT NULL.
const nullableDate = z.union([z.null(), dateValue])

// Reject `{}` operator objects, which would otherwise validate and silently no-op.
const nonEmpty = <T extends z.ZodObject>(schema: T) =>
  schema.refine((value) => Object.keys(value).length > 0, {
    error: 'At least one operator must be provided',
  })

const idFilterSchema = nonEmpty(
  z.strictObject({
    eq: z.uuid().nullable().optional().describe('Equals a specific ID'),
    ne: z.uuid().nullable().optional().describe('Not equal to a specific ID'),
    any: z.array(z.uuid()).min(1).optional().describe('In a list of IDs'),
    none: z.array(z.uuid()).min(1).optional().describe('Not in a list of IDs'),
  }),
)

const idsFilterSchema = nonEmpty(
  z.strictObject({
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
    exists: z
      .boolean()
      .optional()
      .describe('true: linked to at least one; false: linked to none at all'),
  }),
)

const stringFilterShape = {
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
}

// Pattern operators are case-insensitive (ILIKE).
const stringPatternFilterSchema = nonEmpty(
  z.strictObject({
    ...stringFilterShape,
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
  }),
)

// SHA-1 checksum, as 40-char hex or 28-char base64 (detected by length, like Immich).
const checksumString = z
  .string()
  .trim()
  .regex(
    /^(?:[0-9a-fA-F]{40}|[A-Za-z0-9+/]{27}=)$/,
    'Expected a SHA-1 checksum as 40-char hex or 28-char base64',
  )

const checksumFilterSchema = nonEmpty(
  z.strictObject({
    eq: checksumString.optional().describe('Equals a specific checksum'),
    ne: checksumString.optional().describe('Not equal to a specific checksum'),
    any: z
      .array(checksumString)
      .min(1)
      .optional()
      .describe('In a list of checksums'),
    none: z
      .array(checksumString)
      .min(1)
      .optional()
      .describe('Not in a list of checksums'),
  }),
)

const dateFilterSchema = nonEmpty(
  z.strictObject({
    eq: nullableDate.optional().describe('Equals a specific date'),
    ne: nullableDate.optional().describe('Not equal to a specific date'),
    gt: dateValue.optional().describe('After a specific date'),
    lt: dateValue.optional().describe('Before a specific date'),
    gte: dateValue.optional().describe('On or after a specific date'),
    lte: dateValue.optional().describe('On or before a specific date'),
  }),
)

const enumFilterSchema = <const T extends readonly [string, ...string[]]>(
  values: T,
) =>
  nonEmpty(
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
    }),
  )

// Word similarity match against the OCR search table (trigram-based, like Immich).
const ocrFilterSchema = nonEmpty(
  z.strictObject({
    matches: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Word-similarity match against OCR-extracted text'),
    contains: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('OCR text contains a substring (case-insensitive)'),
  }),
)

export const filterSchema = z.strictObject({
  id: idFilterSchema.optional().describe('Filter by asset ID'),
  libraryId: idFilterSchema.optional().describe('Filter by library ID'),
  stackId: idFilterSchema
    .optional()
    .describe('Filter by stack ID (eq: null matches unstacked assets)'),
  duplicateId: idFilterSchema
    .optional()
    .describe(
      'Filter by duplicate group ID (ne: null matches assets flagged as duplicates)',
    ),
  isEncoded: z.boolean().optional().describe('Filter by encoded status'),
  isFavorite: z.boolean().optional().describe('Filter by favorite status'),
  isMotion: z.boolean().optional().describe('Filter by motion photo status'),
  isOffline: z.boolean().optional().describe('Filter by offline status'),
  isExternal: z
    .boolean()
    .optional()
    .describe('Filter by external library status'),
  isEdited: z.boolean().optional().describe('Filter by edited status'),
  status: enumFilterSchema(['active', 'trashed', 'deleted'])
    .optional()
    .describe(
      'Filter by asset status; when omitted everywhere in the filter, status: {eq: active} is applied',
    ),
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
  checksum: checksumFilterSchema.optional().describe('Filter by file checksum'),
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
  ocr: ocrFilterSchema.optional().describe('Filter by OCR text content'),
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

export const searchQuerySchema = z
  .strictObject({
    text: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Natural language query, embedded via the ML service'),
    assetId: z
      .uuid()
      .optional()
      .describe(
        'Reference asset; uses its existing embedding ("more like this")',
      ),
    language: z
      .string()
      .trim()
      .min(2)
      .optional()
      .describe('Language hint for text embedding'),
    maxDistance: z
      .number()
      .gt(0)
      .lte(2)
      .optional()
      .describe(
        'Cosine distance threshold; also makes the query act as a filter',
      ),
  })
  .refine(
    (query) => (query.text === undefined) !== (query.assetId === undefined),
    {
      error: 'Provide exactly one of text or assetId',
    },
  )
  .refine((query) => query.language === undefined || query.text !== undefined, {
    error: 'language is only allowed together with text',
  })

// True when status is filtered anywhere in the tree, which disables the
// implicit status: {eq: 'active'} default applied in searchSchema's transform.
const filterMentionsStatus = (filter: CombinedFilter): boolean => {
  if ('and' in filter) {
    return filter.and.some(filterMentionsStatus)
  }
  if ('or' in filter) {
    return filter.or.some(filterMentionsStatus)
  }
  if ('not' in filter) {
    return filterMentionsStatus(filter.not)
  }
  return filter.status !== undefined
}

const sortFieldSchema = z.enum([
  'fileCreatedAt',
  'fileModifiedAt',
  'createdAt',
  'updatedAt',
  'takenAt',
  'localDateTime',
  'originalFileName',
  'fileSize',
  'random',
  'distance',
])

export const searchSchema = z
  .object({
    filters: combinedFilterSchema,
    query: searchQuerySchema
      .optional()
      .describe('Smart search query (CLIP vector similarity)'),
    joins: z
      .array(z.enum(['exif', 'person', 'stack', 'album', 'owner']))
      .default([]),
    sort: z
      .object({
        field: sortFieldSchema
          .optional()
          .describe(
            'Defaults to distance when a query is present, fileCreatedAt otherwise',
          ),
        direction: z
          .enum(['asc', 'desc'])
          .optional()
          .describe(
            'Defaults to asc for distance, desc otherwise; ignored when field is random',
          ),
      })
      .prefault({}),
    pagination: z
      .object({
        page: z.number().int().min(1).default(1),
        size: z.number().int().min(1).max(100).default(10),
      })
      .prefault({}),
  })
  .superRefine((value, ctx) => {
    if (value.sort.field === 'distance' && value.query === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Sorting by distance requires a query',
        path: ['sort', 'field'],
      })
    }
    if (
      value.query !== undefined &&
      value.sort.field !== undefined &&
      value.sort.field !== 'distance' &&
      value.query.maxDistance === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'A non-distance sort with a query requires query.maxDistance, otherwise the query would have no effect',
        path: ['sort', 'field'],
      })
    }
  })
  .transform((value) => {
    const field =
      value.sort.field ??
      (value.query ? ('distance' as const) : ('fileCreatedAt' as const))
    const direction =
      value.sort.direction ??
      (field === 'distance' ? ('asc' as const) : ('desc' as const))
    const filters = filterMentionsStatus(value.filters)
      ? value.filters
      : {and: [value.filters, {status: {eq: 'active' as const}}]}
    return {...value, filters, sort: {field, direction}}
  })

export type SearchParams = z.infer<typeof searchSchema>
export type SearchQuery = z.infer<typeof searchQuerySchema>
export type Filter = z.infer<typeof filterSchema>
export type CombinedFilter = z.infer<typeof combinedFilterSchema>
