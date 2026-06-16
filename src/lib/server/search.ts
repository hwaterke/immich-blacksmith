import '@tanstack/react-start/server-only'
import {Buffer} from 'node:buffer'
import {sql} from 'kysely'
import type {
  Expression,
  ExpressionBuilder,
  Kysely,
  OrderByItemBuilder,
  RawBuilder,
  SelectQueryBuilder,
  SqlBool,
} from 'kysely'
import {jsonArrayFrom, jsonObjectFrom} from 'kysely/helpers/postgres'
import {db} from './db'
import type {DB} from './db.d'
import type {CombinedFilter, Filter, SearchParams} from '../shared/searchTypes'
import {getQueryEmbedding} from './embedding'

/**
 * Expression-builder context for filter predicates: `asset` is always in
 * scope; `asset_exif` columns may only be referenced when the lazy exif left
 * join was added to the query. The same pre-scan (`collectFields` +
 * `exifFilterFields`) decides both, so the wider type is safe at runtime.
 */
export type SearchEB = ExpressionBuilder<DB, 'asset' | 'asset_exif'>

type IdsFilter = NonNullable<Filter['albumIds']>
type StringPatternFilter = NonNullable<Filter['originalFileName']>
type DateFilter = NonNullable<Filter['createdAt']>

/** Filter fields whose predicates reference asset_exif columns — presence
 *  anywhere in the tree means the query must left-join asset_exif. */
export const exifFilterFields: ReadonlySet<keyof Filter> = new Set<
  keyof Filter
>([
  'city',
  'state',
  'country',
  'make',
  'model',
  'lensModel',
  'description',
  'takenAt',
])

/** Escapes ILIKE wildcards in user input so patterns match literally. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')

/** SHA-1 checksums arrive as 40-char hex or 28-char base64, detected by
 *  length (same as Immich), and compare against a bytea column. */
const decodeChecksum = (value: string) =>
  Buffer.from(value, value.length === 28 ? 'base64' : 'hex')

const isCjk = (code: number): boolean =>
  (code >= 0x4e00 && code <= 0x9fff) ||
  (code >= 0xac00 && code <= 0xd7af) ||
  (code >= 0x3040 && code <= 0x309f) ||
  (code >= 0x30a0 && code <= 0x30ff) ||
  (code >= 0x3400 && code <= 0x4dbf)

/**
 * Ported verbatim from Immich's `tokenizeForSearch`
 * (server/src/utils/database.ts) so `ocr.matches` queries are tokenized
 * exactly like the server that indexed the text: whitespace-separated words,
 * with CJK runs split into bigrams.
 */
export const tokenizeForSearch = (text: string): string[] => {
  const tokens: string[] = []
  let i = 0
  while (i < text.length) {
    const code = text.charCodeAt(i)
    if (code <= 32) {
      i++
      continue
    }

    const start = i
    if (isCjk(code)) {
      while (i < text.length && isCjk(text.charCodeAt(i))) {
        i++
      }
      if (i - start === 1) {
        tokens.push(text[start])
      } else {
        for (let k = start; k < i - 1; k++) {
          tokens.push(text[k] + text[k + 1])
        }
      }
    } else {
      while (
        i < text.length &&
        text.charCodeAt(i) > 32 &&
        !isCjk(text.charCodeAt(i))
      ) {
        i++
      }
      tokens.push(text.slice(start, i))
    }
  }
  return tokens
}

/**
 * eq/ne/any/none for any comparable reference. `eq: null` / `ne: null` mean
 * IS NULL / IS NOT NULL; otherwise SQL three-valued logic stands: `ne` and
 * `none` do not match rows where the column is NULL, and `not: {...}` over a
 * NULL column excludes the row unless `eq/ne: null` is used explicitly.
 */
const equalityOps = <T>(
  eb: SearchEB,
  ref: Expression<T | null>,
  ops: {eq?: T | null; ne?: T | null; any?: T[]; none?: T[]},
): Expression<SqlBool>[] => {
  // The `never` casts are sound: the signature ties the operand values to the
  // reference's type, but TypeScript cannot resolve Kysely's operand
  // conditional types for an unbound T.
  const exprs: Expression<SqlBool>[] = []
  if (ops.eq !== undefined) {
    exprs.push(
      ops.eq === null ? eb(ref, 'is', null) : eb(ref, '=', ops.eq as never),
    )
  }
  if (ops.ne !== undefined) {
    exprs.push(
      ops.ne === null
        ? eb(ref, 'is not', null)
        : eb(ref, '!=', ops.ne as never),
    )
  }
  if (ops.any !== undefined) {
    exprs.push(eb(ref, 'in', ops.any as never))
  }
  if (ops.none !== undefined) {
    exprs.push(eb(ref, 'not in', ops.none as never))
  }
  return exprs
}

const dateOps = (
  eb: SearchEB,
  ref: Expression<Date | null>,
  ops: DateFilter,
): Expression<SqlBool>[] => {
  const exprs = equalityOps(eb, ref, ops)
  if (ops.gt !== undefined) {
    exprs.push(eb(ref, '>', ops.gt))
  }
  if (ops.lt !== undefined) {
    exprs.push(eb(ref, '<', ops.lt))
  }
  if (ops.gte !== undefined) {
    exprs.push(eb(ref, '>=', ops.gte))
  }
  if (ops.lte !== undefined) {
    exprs.push(eb(ref, '<=', ops.lte))
  }
  return exprs
}

/** String operators with contains/startsWith/endsWith as plain ILIKE. */
const patternOps = (
  eb: SearchEB,
  ref: Expression<string | null>,
  ops: StringPatternFilter,
): Expression<SqlBool>[] => {
  const exprs = equalityOps(eb, ref, ops)
  if (ops.contains !== undefined) {
    exprs.push(eb(ref, 'ilike', `%${escapeLike(ops.contains)}%`))
  }
  if (ops.startsWith !== undefined) {
    exprs.push(eb(ref, 'ilike', `${escapeLike(ops.startsWith)}%`))
  }
  if (ops.endsWith !== undefined) {
    exprs.push(eb(ref, 'ilike', `%${escapeLike(ops.endsWith)}`))
  }
  return exprs
}

/**
 * Same string operators, but pattern matching wraps both sides in
 * f_unaccent() to hit Immich's trigram indexes (the exact expression shape of
 * Immich's searchAssetBuilder). eq/ne/any/none stay exact on the raw column.
 */
const unaccentPatternOps = (
  eb: SearchEB,
  column: RawBuilder<string>,
  exact: Expression<string | null>,
  ops: StringPatternFilter,
): Expression<SqlBool>[] => {
  const exprs = equalityOps(eb, exact, ops)
  if (ops.contains !== undefined) {
    exprs.push(
      eb(
        column,
        'ilike',
        sql<string>`'%' || f_unaccent(${escapeLike(ops.contains)}) || '%'`,
      ),
    )
  }
  if (ops.startsWith !== undefined) {
    exprs.push(
      eb(
        column,
        'ilike',
        sql<string>`f_unaccent(${escapeLike(ops.startsWith)}) || '%'`,
      ),
    )
  }
  if (ops.endsWith !== undefined) {
    exprs.push(
      eb(
        column,
        'ilike',
        sql<string>`'%' || f_unaccent(${escapeLike(ops.endsWith)})`,
      ),
    )
  }
  return exprs
}

type AssetFileType = 'preview' | 'thumbnail' | 'encoded_video'

/**
 * Correlated scalar subquery for an asset_file path. Restricted to the
 * non-edited row so the subquery stays scalar (unique index on
 * (assetId, type, isEdited)). No row → NULL, so `eq: null` naturally means
 * "asset has no such file".
 */
const filePathRef = (eb: SearchEB, type: AssetFileType) =>
  eb
    .selectFrom('asset_file')
    .select('asset_file.path')
    .whereRef('asset_file.assetId', '=', 'asset.id')
    .where('asset_file.type', '=', type)
    .where('asset_file.isEdited', '=', false)
    .$asScalar()

/**
 * any/all/none/exists over a correlated EXISTS subquery, so relation filters
 * compose under or/not (unlike Immich's query-level inner joins). `all` is
 * Immich's grouped distinct-count pattern expressed as EXISTS.
 */
const relationOps = (
  eb: SearchEB,
  ops: IdsFilter,
  shapes: {
    withIds: (ids: string[]) => Expression<unknown>
    withAllIds: (ids: string[]) => Expression<unknown>
    bare: () => Expression<unknown>
  },
): Expression<SqlBool>[] => {
  const exprs: Expression<SqlBool>[] = []
  if (ops.any !== undefined) {
    exprs.push(eb.exists(shapes.withIds(ops.any)))
  }
  if (ops.all !== undefined) {
    exprs.push(eb.exists(shapes.withAllIds(ops.all)))
  }
  if (ops.none !== undefined) {
    exprs.push(eb.not(eb.exists(shapes.withIds(ops.none))))
  }
  if (ops.exists !== undefined) {
    const exists = eb.exists(shapes.bare())
    exprs.push(ops.exists ? exists : eb.not(exists))
  }
  return exprs
}

/**
 * Field registry: translates one field's operator object into self-contained
 * boolean expressions on the asset row. Exhaustive over the filter schema —
 * adding a field to `filterSchema` without a translation here is a compile
 * error.
 */
const fieldBuilders: {
  [K in keyof Filter]-?: (
    eb: SearchEB,
    ops: NonNullable<Filter[K]>,
  ) => Expression<SqlBool>[]
} = {
  id: (eb, ops) => equalityOps(eb, eb.ref('asset.id'), ops),
  libraryId: (eb, ops) => equalityOps(eb, eb.ref('asset.libraryId'), ops),
  stackId: (eb, ops) => equalityOps(eb, eb.ref('asset.stackId'), ops),
  duplicateId: (eb, ops) => equalityOps(eb, eb.ref('asset.duplicateId'), ops),
  // Immich's isEncoded shape: an encoded-video file row exists for the asset.
  isEncoded: (eb, value) => {
    const exists = eb.exists(
      eb
        .selectFrom('asset_file')
        .whereRef('asset_file.assetId', '=', 'asset.id')
        .where('asset_file.type', '=', 'encoded_video'),
    )
    return [value ? exists : eb.not(exists)]
  },
  isFavorite: (eb, value) => [eb('asset.isFavorite', '=', value)],
  isMotion: (eb, value) => [
    eb('asset.livePhotoVideoId', value ? 'is not' : 'is', null),
  ],
  isOffline: (eb, value) => [eb('asset.isOffline', '=', value)],
  isExternal: (eb, value) => [eb('asset.isExternal', '=', value)],
  isEdited: (eb, value) => [eb('asset.isEdited', '=', value)],
  status: (eb, ops) => equalityOps(eb, eb.ref('asset.status'), ops),
  visibility: (eb, ops) => equalityOps(eb, eb.ref('asset.visibility'), ops),
  type: (eb, ops) => equalityOps(eb, eb.ref('asset.type'), ops),
  city: (eb, ops) => patternOps(eb, eb.ref('asset_exif.city'), ops),
  state: (eb, ops) => patternOps(eb, eb.ref('asset_exif.state'), ops),
  country: (eb, ops) => patternOps(eb, eb.ref('asset_exif.country'), ops),
  make: (eb, ops) => patternOps(eb, eb.ref('asset_exif.make'), ops),
  model: (eb, ops) => patternOps(eb, eb.ref('asset_exif.model'), ops),
  lensModel: (eb, ops) => patternOps(eb, eb.ref('asset_exif.lensModel'), ops),
  description: (eb, ops) =>
    unaccentPatternOps(
      eb,
      sql<string>`f_unaccent(asset_exif.description)`,
      eb.ref('asset_exif.description'),
      ops,
    ),
  checksum: (eb, ops) =>
    equalityOps(eb, eb.ref('asset.checksum'), {
      eq: ops.eq === undefined ? undefined : decodeChecksum(ops.eq),
      ne: ops.ne === undefined ? undefined : decodeChecksum(ops.ne),
      any: ops.any?.map(decodeChecksum),
      none: ops.none?.map(decodeChecksum),
    }),
  originalFileName: (eb, ops) =>
    unaccentPatternOps(
      eb,
      sql<string>`f_unaccent(asset."originalFileName")`,
      eb.ref('asset.originalFileName'),
      ops,
    ),
  originalPath: (eb, ops) =>
    unaccentPatternOps(
      eb,
      sql<string>`f_unaccent(asset."originalPath")`,
      eb.ref('asset.originalPath'),
      ops,
    ),
  previewPath: (eb, ops) => patternOps(eb, filePathRef(eb, 'preview'), ops),
  thumbnailPath: (eb, ops) => patternOps(eb, filePathRef(eb, 'thumbnail'), ops),
  encodedVideoPath: (eb, ops) =>
    patternOps(eb, filePathRef(eb, 'encoded_video'), ops),
  albumIds: (eb, ops) => {
    const sub = () =>
      eb
        .selectFrom('album_asset')
        .whereRef('album_asset.assetId', '=', 'asset.id')
    const withIds = (ids: string[]) =>
      sub().where('album_asset.albumId', 'in', ids)
    return relationOps(eb, ops, {
      withIds,
      withAllIds: (ids) =>
        withIds(ids)
          .groupBy('album_asset.assetId')
          .having(
            (he) => he.fn.count('album_asset.albumId').distinct(),
            '=',
            ids.length,
          ),
      bare: sub,
    })
  },
  personIds: (eb, ops) => {
    // Immich's hasPeople predicates: deleted or hidden faces never count, for
    // every operator including none/exists.
    const sub = () =>
      eb
        .selectFrom('asset_face')
        .whereRef('asset_face.assetId', '=', 'asset.id')
        .where('asset_face.deletedAt', 'is', null)
        .where('asset_face.isVisible', '=', true)
    const withIds = (ids: string[]) =>
      sub().where('asset_face.personId', 'in', ids)
    return relationOps(eb, ops, {
      withIds,
      withAllIds: (ids) =>
        withIds(ids)
          .groupBy('asset_face.assetId')
          .having(
            (he) => he.fn.count('asset_face.personId').distinct(),
            '=',
            ids.length,
          ),
      // A face without a personId is detected but not recognized — it must
      // not count as "linked to at least one person".
      bare: () => sub().where('asset_face.personId', 'is not', null),
    })
  },
  tagIds: (eb, ops) => {
    // tag_closure makes a parent tag match descendant-tagged assets
    // (Immich's hasTags).
    const sub = () =>
      eb
        .selectFrom('tag_asset')
        .innerJoin(
          'tag_closure',
          'tag_asset.tagId',
          'tag_closure.id_descendant',
        )
        .whereRef('tag_asset.assetId', '=', 'asset.id')
    const withIds = (ids: string[]) =>
      sub().where('tag_closure.id_ancestor', 'in', ids)
    return relationOps(eb, ops, {
      withIds,
      withAllIds: (ids) =>
        withIds(ids)
          .groupBy('tag_asset.assetId')
          .having(
            (he) => he.fn.count('tag_closure.id_ancestor').distinct(),
            '=',
            ids.length,
          ),
      // "Any tag at all" doesn't need the closure join.
      bare: () =>
        eb
          .selectFrom('tag_asset')
          .whereRef('tag_asset.assetId', '=', 'asset.id'),
    })
  },
  ownerIds: (eb, ops) => {
    // asset.ownerId is a plain non-nullable column despite the ids-style
    // operators: an asset has exactly one owner, so `all` with more than one
    // id can never match and `exists` is constant.
    const exprs: Expression<SqlBool>[] = []
    if (ops.any !== undefined) {
      exprs.push(eb('asset.ownerId', 'in', ops.any))
    }
    if (ops.all !== undefined) {
      exprs.push(
        ops.all.length === 1
          ? eb('asset.ownerId', '=', ops.all[0])
          : eb.lit(false),
      )
    }
    if (ops.none !== undefined) {
      exprs.push(eb('asset.ownerId', 'not in', ops.none))
    }
    if (ops.exists !== undefined) {
      exprs.push(eb.lit(ops.exists))
    }
    return exprs
  },
  createdAt: (eb, ops) => dateOps(eb, eb.ref('asset.createdAt'), ops),
  updatedAt: (eb, ops) => dateOps(eb, eb.ref('asset.updatedAt'), ops),
  trashedAt: (eb, ops) => dateOps(eb, eb.ref('asset.deletedAt'), ops),
  takenAt: (eb, ops) => dateOps(eb, eb.ref('asset_exif.dateTimeOriginal'), ops),
  fileCreatedAt: (eb, ops) => dateOps(eb, eb.ref('asset.fileCreatedAt'), ops),
  fileModifiedAt: (eb, ops) => dateOps(eb, eb.ref('asset.fileModifiedAt'), ops),
  localDateTime: (eb, ops) => dateOps(eb, eb.ref('asset.localDateTime'), ops),
  ocr: (eb, ops) => {
    // EXISTS on ocr_search (PK assetId) instead of Immich's join, so the
    // predicate composes under or/not.
    const sub = eb
      .selectFrom('ocr_search')
      .whereRef('ocr_search.assetId', '=', 'asset.id')
    const exprs: Expression<SqlBool>[] = []
    if (ops.matches !== undefined) {
      const needle = tokenizeForSearch(ops.matches).join(' ')
      exprs.push(
        eb.exists(
          sub.where(
            sql<SqlBool>`f_unaccent(ocr_search.text) %>> f_unaccent(${needle})`,
          ),
        ),
      )
    }
    if (ops.contains !== undefined) {
      exprs.push(
        eb.exists(
          sub.where(
            'ocr_search.text',
            'ilike',
            `%${escapeLike(ops.contains)}%`,
          ),
        ),
      )
    }
    return exprs
  },
}

/** All operators of all present fields, ANDed (an empty filter is TRUE). */
const buildFieldFilter = (eb: SearchEB, filter: Filter): Expression<SqlBool> =>
  eb.and(
    Object.entries(filter).flatMap(([field, ops]) =>
      // Object.entries loses the key↔value correlation, but each registry
      // entry only ever receives its own field's operator object.
      ops === undefined
        ? []
        : fieldBuilders[field as keyof Filter](eb, ops as never),
    ),
  )

/**
 * Recursively translates the combinator tree into one self-contained boolean
 * expression. `filterSchema` is a strict object without and/or/not keys, so
 * the `in` checks discriminate the union safely.
 */
export const buildCombined = (
  eb: SearchEB,
  filter: CombinedFilter,
): Expression<SqlBool> => {
  if ('and' in filter) {
    return eb.and(filter.and.map((child) => buildCombined(eb, child)))
  }
  if ('or' in filter) {
    return eb.or(filter.or.map((child) => buildCombined(eb, child)))
  }
  if ('not' in filter) {
    return eb.not(buildCombined(eb, filter.not))
  }
  return buildFieldFilter(eb, filter)
}

/** Set of filter fields present anywhere in the combinator tree; drives the
 *  lazy asset_exif join (via `exifFilterFields`). */
export const collectFields = (filter: CombinedFilter): Set<keyof Filter> => {
  const fields = new Set<keyof Filter>()
  const walk = (node: CombinedFilter): void => {
    if ('and' in node) {
      for (const child of node.and) {
        walk(child)
      }
    } else if ('or' in node) {
      for (const child of node.or) {
        walk(child)
      }
    } else if ('not' in node) {
      walk(node.not)
    } else {
      for (const [field, ops] of Object.entries(node)) {
        if (ops !== undefined) {
          fields.add(field as keyof Filter)
        }
      }
    }
  }
  walk(filter)
  return fields
}

/** Sort fields that map straight to an `asset.<col>` order-by reference. */
const assetSortColumns = {
  fileCreatedAt: 'asset.fileCreatedAt',
  fileModifiedAt: 'asset.fileModifiedAt',
  createdAt: 'asset.createdAt',
  updatedAt: 'asset.updatedAt',
  localDateTime: 'asset.localDateTime',
  originalFileName: 'asset.originalFileName',
} as const

/**
 * Whether the query needs the asset_exif left join: a filter references an
 * exif field, the sort is takenAt/fileSize, or `exif` enrichment was asked
 * for. Drives both the physical join and the SearchEB cast below.
 */
const needsExifJoin = (params: SearchParams): boolean => {
  if (params.sort.field === 'takenAt' || params.sort.field === 'fileSize') {
    return true
  }
  if (params.joins.includes('exif')) {
    return true
  }
  for (const field of collectFields(params.filters)) {
    if (exifFilterFields.has(field)) {
      return true
    }
  }
  return false
}

/** Recognized, visible people on the asset, de-duplicated by person id. */
const peopleJson = (eb: SearchEB) =>
  jsonArrayFrom(
    eb
      .selectFrom('asset_face')
      .innerJoin('person', 'person.id', 'asset_face.personId')
      .whereRef('asset_face.assetId', '=', 'asset.id')
      .where('asset_face.deletedAt', 'is', null)
      .where('asset_face.isVisible', '=', true)
      .distinctOn('person.id')
      .selectAll('person'),
  )

/** The stack the asset belongs to, or null when it is unstacked. */
const stackJson = (eb: SearchEB) =>
  jsonObjectFrom(
    eb
      .selectFrom('stack')
      .whereRef('stack.id', '=', 'asset.stackId')
      .selectAll('stack'),
  )

/** Albums the asset is a member of. */
const albumsJson = (eb: SearchEB) =>
  jsonArrayFrom(
    eb
      .selectFrom('album_asset')
      .innerJoin('album', 'album.id', 'album_asset.albumId')
      .whereRef('album_asset.assetId', '=', 'asset.id')
      .selectAll('album'),
  )

/** The owning user. Columns are listed explicitly because the user table also
 *  holds password/pinCode — never selectAll here. */
const ownerJson = (eb: SearchEB) =>
  jsonObjectFrom(
    eb
      .selectFrom('user')
      .whereRef('user.id', '=', 'asset.ownerId')
      .select([
        'user.id',
        'user.name',
        'user.email',
        'user.avatarColor',
        'user.profileImagePath',
      ]),
  )

/**
 * Applies the resolved sort plus a stable secondary `asset.id` order. Generic
 * over the output type so it composes after the enrichment selects without
 * widening it.
 */
const applySort = <O>(
  query: SelectQueryBuilder<DB, 'asset' | 'asset_exif', O>,
  params: SearchParams,
  distanceExpr: RawBuilder<number> | undefined,
): SelectQueryBuilder<DB, 'asset' | 'asset_exif', O> => {
  const {field, direction} = params.sort

  // random() ordering is not stable across pages (documented limitation).
  if (field === 'random') {
    return query.orderBy(sql`random()`)
  }

  const directed = (ob: OrderByItemBuilder) =>
    direction === 'asc' ? ob.asc() : ob.desc()
  // takenAt / fileSize are nullable: keep NULLs last regardless of direction.
  const directedNullsLast = (ob: OrderByItemBuilder) => directed(ob).nullsLast()

  const ordered =
    field === 'distance'
      ? // The schema guarantees a query (hence distanceExpr) for distance sort.
        query.orderBy(distanceExpr as RawBuilder<number>, directed)
      : field === 'takenAt'
        ? query.orderBy('asset_exif.dateTimeOriginal', directedNullsLast)
        : field === 'fileSize'
          ? query.orderBy('asset_exif.fileSizeInByte', directedNullsLast)
          : query.orderBy(assetSortColumns[field], directed)

  return ordered.orderBy('asset.id')
}

/**
 * Assembles the full select query (no execution) so it can be unit-tested via
 * `.compile()`. The executor is `db` or a transaction; the smart_search
 * distance, exif join, filters, enrichment, sort and pagination are all driven
 * by `params` (§1, §7, §8 of builder-spec.md).
 */
export const buildSearchQuery = (
  executor: Kysely<DB>,
  params: SearchParams,
  embedding?: string,
) => {
  const distanceExpr =
    embedding === undefined
      ? undefined
      : sql<number>`smart_search.embedding <=> ${embedding}`

  // Lazy asset_exif left join (1:1 on the PK, so it filters nothing). The cast
  // widens the scope to asset_exif for the filter/sort/enrichment code; it is
  // sound because needsExifJoin gates both the physical join and every
  // reference to an asset_exif column.
  const base = executor
    .selectFrom('asset')
    .$if(needsExifJoin(params), (qb) =>
      qb.leftJoin('asset_exif', 'asset_exif.assetId', 'asset.id'),
    ) as unknown as SelectQueryBuilder<
    DB,
    'asset' | 'asset_exif',
    Record<string, never>
  >

  const filtered = base
    .selectAll('asset')
    .$if(distanceExpr !== undefined, (qb) =>
      qb
        .innerJoin('smart_search', 'smart_search.assetId', 'asset.id')
        .select((distanceExpr as RawBuilder<number>).as('distance')),
    )
    .where((eb) => buildCombined(eb, params.filters))
    .$if(params.query?.maxDistance !== undefined, (qb) =>
      // Repeat the distance expression in WHERE instead of referencing the
      // select alias (which SQL forbids): same index behavior, and it avoids a
      // CTE that would break the asset.id correlations in EXISTS sub-filters.
      qb.where(
        distanceExpr as RawBuilder<number>,
        '<=',
        params.query?.maxDistance as number,
      ),
    )
    .$if(params.joins.includes('exif'), (qb) =>
      // to_json over the left-joined row: a missing exif row yields an
      // all-null object rather than SQL null.
      qb.select((eb) => eb.fn.toJson('asset_exif').as('exif')),
    )
    .$if(params.joins.includes('person'), (qb) =>
      qb.select((eb) => peopleJson(eb).as('people')),
    )
    .$if(params.joins.includes('stack'), (qb) =>
      qb.select((eb) => stackJson(eb).as('stack')),
    )
    .$if(params.joins.includes('album'), (qb) =>
      qb.select((eb) => albumsJson(eb).as('albums')),
    )
    .$if(params.joins.includes('owner'), (qb) =>
      qb.select((eb) => ownerJson(eb).as('owner')),
    )

  const {page, size} = params.pagination
  // limit(size + 1) is the no-COUNT hasNextPage probe; the extra row is
  // trimmed in searchAssets.
  return applySort(filtered, params, distanceExpr)
    .limit(size + 1)
    .offset((page - 1) * size)
}

export type SearchAssetRow = Awaited<
  ReturnType<ReturnType<typeof buildSearchQuery>['execute']>
>[number]

export interface SearchResult {
  items: SearchAssetRow[]
  hasNextPage: boolean
}

/**
 * Cached probe for the vchord extension; its presence selects the
 * transaction + `set local vchordrq.probes` shape (mirrors assetDistance).
 * Reset on failure so a transient connection error doesn't poison the cache.
 */
let vchordProbe: Promise<boolean> | undefined
const hasVchord = (): Promise<boolean> => {
  if (vchordProbe === undefined) {
    vchordProbe = sql`select 1 from pg_extension where extname = 'vchord'`
      .execute(db)
      .then((result) => result.rows.length > 0)
      .catch((error: unknown) => {
        vchordProbe = undefined
        throw error
      })
  }
  return vchordProbe
}

/**
 * Runs a custom search: resolves the optional smart-search embedding, builds
 * the query, and returns one page of enriched assets plus a hasNextPage flag.
 * When an embedding is present and vchord is installed, the query runs inside a
 * transaction that sets the probe count (the vector index only serves the
 * ORDER BY … LIMIT).
 */
export async function searchAssets(
  params: SearchParams,
): Promise<SearchResult> {
  const embedding = params.query
    ? await getQueryEmbedding(params.query)
    : undefined

  const {size} = params.pagination
  const run = async (executor: Kysely<DB>): Promise<SearchResult> => {
    const rows = await buildSearchQuery(executor, params, embedding).execute()
    const hasNextPage = rows.length > size
    if (hasNextPage) {
      rows.splice(size)
    }
    return {items: rows, hasNextPage}
  }

  if (embedding !== undefined && (await hasVchord())) {
    return db.transaction().execute(async (trx) => {
      await sql`set local vchordrq.probes = ${sql.lit(1)}`.execute(trx)
      return run(trx)
    })
  }
  return run(db)
}
