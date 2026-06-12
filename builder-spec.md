# Implement `searchAssets` builder in src/lib/server/search.ts

## Context

The custom search API has a finished, tested request schema
(`src/lib/shared/searchTypes.ts`) and an embedding resolver
(`src/lib/server/embedding.ts`). What's missing is the engine:
`searchAssets(params: SearchParams)` in `src/lib/server/search.ts`, which must
translate the parsed filter tree (arbitrary `and`/`or`/`not` nesting + typed
per-field operators) into a single Kysely query against the Immich Postgres DB
(read-only user), with smart-search vector distance, sorting, pagination, and
response-enrichment joins. Immich's own implementation
(`searchAssetBuilder` in `server/src/utils/database.ts`,
`search.repository.ts`) is the reference for SQL shapes, but it's a flat
`$if` chain — ours must be a recursive expression-builder walk so every
predicate composes under `or`/`not`.

Decisions confirmed (on top of builder.md's settled ones):
- **tagIds** use `tag_closure` (parent tag matches descendant-tagged assets).
- **Enrichment** as nested JSON in one query (`jsonObjectFrom`/`jsonArrayFrom`).
- **Pagination** returns `{items, hasNextPage}` via the `limit(size + 1)` trick — no COUNT.
- **previewPath/thumbnailPath/encodedVideoPath** via correlated scalar subquery on `asset_file`.

## Key constraint driving the design

Because filters nest under `or`/`not`, **every filter predicate must be a
self-contained boolean expression on the asset row** — no filter may add a
query-level `innerJoin` (Immich can, we can't). Therefore:
- Relation filters (albums/people/tags/ocr) → correlated `EXISTS` subqueries.
- exif fields → one lazy `leftJoin('asset_exif', ...)` (1:1 on PK), predicates
  reference `asset_exif.*` columns; the left join itself filters nothing.
- `asset_file` paths → correlated scalar subqueries.
- The only filter-relevant `innerJoin` is `smart_search`, driven by `params.query`
  (top-level, not part of the filter tree — assets without embeddings are
  inherently excluded when a query is present, same as Immich).

## Implementation

### 1. Top-level flow of `searchAssets(params)`

```
1. embedding = params.query ? await getQueryEmbedding(params.query) : undefined
2. executor = hasVchord() && embedding ? transaction + `set local vchordrq.probes = 1` : db
3. build query:
   - selectFrom('asset').selectAll('asset')
   - if embedding: innerJoin('smart_search', 'asset.id', 'smart_search.assetId')
     and select sql<number>`smart_search.embedding <=> ${embedding}`.as('distance')
   - if exif needed (filters reference an exif field, sort is takenAt/fileSize,
     or joins includes 'exif'): leftJoin('asset_exif', 'asset.id', 'asset_exif.assetId')
   - .where((eb) => buildCombined(eb, params.filters))
   - if query.maxDistance: .where(distanceExpr, '<=', maxDistance)
   - enrichment selects per params.joins
   - orderBy + limit(size + 1) + offset((page - 1) * size)
4. rows = await execute; hasNextPage = rows.length > size; rows.splice(size)
5. return {items: rows, hasNextPage}
```

vchord detection: module-level cached promise,
`select 1 from pg_extension where extname = 'vchord'` (mirror
`assetDistance` in `src/lib/assetQueries.ts:119` for the probes/transaction
shape; `sql.lit(1)` for the probe count). Skip the transaction entirely when
there is no query or no vchord.

**Deviation from builder.md, flagged for review**: builder.md suggests a CTE
for `maxDistance` (because a select alias can't be referenced in WHERE). Plan
is to instead repeat the raw distance expression in WHERE
(`where(sql`smart_search.embedding <=> ${embedding}`, '<=', max)`) — identical
semantics, valid SQL, same index behavior (the vector index only serves
ORDER BY…LIMIT either way), and it avoids re-aliasing problems: a CTE would
break the `whereRef(..., 'asset.id')` correlation used by every EXISTS filter
and enrichment sub-select.

### 2. Recursive combinator walk

```ts
const buildCombined = (eb: SearchEB, f: CombinedFilter): Expression<SqlBool> =>
  'and' in f ? eb.and(f.and.map((c) => buildCombined(eb, c)))
  : 'or' in f ? eb.or(f.or.map((c) => buildCombined(eb, c)))
  : 'not' in f ? eb.not(buildCombined(eb, f.not))
  : buildFieldFilter(eb, f)   // eb.and([...one expr per present field])
```

(`filterSchema` is a strictObject without `and`/`or`/`not` keys, so the `in`
checks discriminate the union safely.) `SearchEB` is
`ExpressionBuilder<DB, 'asset' | 'asset_exif'>`; the conditional exif join
means one type assertion when constructing the query — runtime-safe because
exif columns are only referenced when the join was added (same pre-scan
decides both).

`buildFieldFilter` dispatches each present field through a **field registry**:

| kind | fields | translation |
|---|---|---|
| id column | id, libraryId, stackId, duplicateId | column on `asset` |
| owner | ownerIds | `asset.ownerId` (see §5) |
| bool | isFavorite, isOffline, isExternal, isEdited | `eb('asset.x', '=', v)` |
| derived bool | isEncoded, isMotion | §6 |
| enum | status, visibility, type | columns on `asset` |
| string/pattern | originalFileName, originalPath (asset); city, state, country, make, model, lensModel, description (asset_exif) | §3 |
| checksum | checksum | decode → Buffer, compare bytea |
| date | createdAt, updatedAt, fileCreatedAt, fileModifiedAt, localDateTime (asset); trashedAt = `asset.deletedAt`; takenAt = `asset_exif.dateTimeOriginal` | §3 |
| file path | previewPath, thumbnailPath, encodedVideoPath | §4 |
| relation | albumIds, personIds, tagIds | §5 |
| ocr | ocr | §6 |

A tree-scan helper (`collectFields`, same recursion shape as
`filterMentionsStatus` in searchTypes.ts) determines up front whether the exif
join is needed.

### 3. Scalar operator translators (shared helpers)

One small translator per operator family, each returning `Expression<SqlBool>[]`
for a column/expression reference:

- **eq/ne**: `eq: null` → `is null`, `ne: null` → `is not null`; otherwise
  `=` / `!=`. (SQL three-valued logic stands: `ne: 'x'` does not match NULL
  rows, and `not: {...}` over a NULL column excludes the row — document this
  in a comment, don't coalesce.)
- **any/none**: `in` / `not in` (Kysely handles array params).
- **pattern (contains/startsWith/endsWith)**: ILIKE with `%`/`_`/`\` escaped in
  user input (`s.replace(/[\\%_]/g, '\\$&')`). For `originalFileName`,
  `originalPath`, and `description` wrap both sides in `f_unaccent(...)` to hit
  Immich's trigram indexes — exact Immich shape:
  `sql`f_unaccent(asset."originalFileName")`, 'ilike', sql`'%' || f_unaccent(${v}) || '%'``
  (prefix/suffix variants drop the leading/trailing `%`). Other string fields:
  plain ILIKE.
- **checksum**: `Buffer.from(s, s.length === 28 ? 'base64' : 'hex')`, then
  eq/ne/any/none on the bytea column.
- **date**: eq/ne (nullable) + gt/lt/gte/lte, values are already `Date`s.

### 4. asset_file path filters (scalar subquery)

```ts
const filePath = (eb, type: string) =>
  eb.selectFrom('asset_file').select('asset_file.path')
    .whereRef('asset_file.assetId', '=', 'asset.id')
    .where('asset_file.type', '=', type)
```
All string operators apply to this expression like a column; `eq: null` →
`is null` naturally means "no such file" (no row → NULL scalar).
Type values per Immich's `AssetFileType` enum: `preview`, `thumbnail`,
`encoded_video` — **verify with `select distinct type from asset_file` against
the live DB before hardcoding** (builder.md requirement).

### 5. Relation filters (EXISTS shapes, from Immich's hasPeople/hasTags/inAlbums)

Base correlated subqueries (each composes under or/not because it's an expression):

- **albumIds**: `album_asset` where `assetId = asset.id`
- **personIds**: `asset_face` where `assetId = asset.id` **and `deletedAt is null`
  and `isVisible = true`** (Immich's hasPeople, database.ts:237) — applied to
  every operator including `none`/`exists` so a deleted face never counts
- **tagIds**: `tag_asset` inner join `tag_closure` on
  `tag_asset.tagId = tag_closure.id_descendant`, match on `id_ancestor`
  (Immich's hasTags, database.ts:267)

Operators:
- `any` → `eb.exists(sub.where(idCol, 'in', ids))`
- `none` → `eb.not(eb.exists(...any shape...))`
- `exists: true/false` → `EXISTS` / `NOT EXISTS` with no id predicate
- `all` → EXISTS with grouped distinct count (Immich's pattern, as EXISTS
  instead of innerJoin):
  `exists(sub.where(idCol, 'in', ids).groupBy(assetId).having(count(idCol).distinct(), '=', ids.length))`
  — for tags the counted column is `tag_closure.id_ancestor`.

**ownerIds** is a plain non-nullable column (`asset.ownerId`): `any` → `in`,
`none` → `not in`, `all` → `=` when exactly one id else `eb.lit(false)`,
`exists` → `eb.lit(true/false)`. One comment documenting why.

### 6. Derived booleans and OCR

- **isEncoded**: `EXISTS (asset_file where type = 'encoded_video')`, negated
  for `false` (Immich database.ts:468).
- **isMotion**: `asset.livePhotoVideoId is [not] null`.
- **ocr** (EXISTS on `ocr_search`, PK assetId, instead of Immich's join — composes
  under combinators):
  - `matches` → `exists(... where f_unaccent(ocr_search.text) %>> f_unaccent(${tokens.join(' ')}))`;
    port Immich's `tokenizeForSearch` (database.ts:327, ~30 lines incl. CJK
    bigram splitting) verbatim with an attribution comment.
  - `contains` → `exists(... where ocr_search.text ilike escaped('%v%'))`.

### 7. Sorting

| sort field | expression |
|---|---|
| fileCreatedAt, fileModifiedAt, createdAt, updatedAt, localDateTime, originalFileName | `asset.<col>` |
| takenAt | `asset_exif.dateTimeOriginal` (forces exif join) |
| fileSize | `asset_exif.fileSizeInByte` (forces exif join) |
| distance | the `<=>` expression (schema guarantees a query is present) |
| random | `sql`random()`` (unstable across pages — documented, builder.md parked decision) |

Direction comes resolved from the schema. Nullable sort columns (takenAt,
fileSize) get `nulls last`. Always add `orderBy('asset.id')` as secondary sort
(except random) for stable pagination.

### 8. Enrichment joins (`params.joins`, nested JSON in one query)

Using `jsonObjectFrom`/`jsonArrayFrom` from `kysely/helpers/postgres`:

- `exif` → reuse the single left-joined `asset_exif`:
  `eb.fn.toJson(eb.table('asset_exif')).as('exif')` (Immich's withExif pattern,
  database.ts:98) — satisfies builder.md's "avoid double-joining exif".
- `person` → `jsonArrayFrom(asset_face ⋈ person where assetId = asset.id and
  deletedAt is null and isVisible)` selecting person columns, distinct on
  person id → `people`.
- `stack` → `jsonObjectFrom(stack where stack.id = asset.stackId)`.
- `album` → `jsonArrayFrom(album_asset ⋈ album where assetId = asset.id)` → `albums`.
- `owner` → `jsonObjectFrom(user where user.id = asset.ownerId)` selecting an
  **explicit safe column list (id, name, email, avatarColor, profileImagePath)
  — never `selectAll`, the user table contains `password`/`pinCode`**.

### 9. Return type

```ts
interface SearchResult {
  items: Array<Selectable<Asset> & {
    distance?: number          // present when query given
    exif?: ... | null, people?: ..., stack?: ... | null, albums?: ..., owner?: ... | null
  }>
  hasNextPage: boolean
}
```

## Files

- `src/lib/server/search.ts` — rewrite the stub with the above (registry +
  translators + walk + query assembly; roughly: helpers first, exported
  `searchAssets` last).
- `src/lib/server/search.test.ts` — new test file (vitest, like
  `embedding.test.ts` / `searchTypes.test.ts`).

Reuse, don't reinvent: `getQueryEmbedding` (embedding.ts), `db` (src/db.ts),
probes/transaction shape from `assetDistance` (assetQueries.ts:119), schema
types from searchTypes.ts.

## Verification

1. **Pre-implementation DB checks** (read-only, via a throwaway script or psql):
   `select distinct type from asset_file`; `select extname from pg_extension`
   (confirm `vchord` name).
2. **Unit tests without a DB**: Kysely's `.compile()` produces SQL + params
   without connecting. Build the query for representative `SearchParams`
   (parsed through `searchSchema.parse` so defaults/status-injection apply) and
   assert on SQL fragments: nested or/not composition, EXISTS shapes for
   any/all/none/exists, `f_unaccent ... ilike` for originalFileName,
   `%>>` for ocr.matches, checksum Buffer params, `<=>` ordering + maxDistance
   WHERE, limit = size+1 / offset, enrichment sub-selects, secondary
   `asset.id` order. (Requires exposing an internal `buildSearchQuery(params,
   embedding?)` separate from the executing `searchAssets` — also keeps the
   transaction wrapper thin.)
3. **Live smoke test** against the read-only DB (env-gated, manual): a text
   query + filters returning sensible rows, distance ascending, hasNextPage
   correct on a small page size.
4. `pnpm typecheck` — the stub's pre-existing error must be gone; only
   `sanity-check.tsx` / `data/query-to-delete.ts` errors may remain.
   `pnpm test` for the new + existing suites.

## Progress

- **2026-06-12 — Verification step 1 (pre-implementation DB checks) done.**
  Ran read-only queries against the live DB (192.168.1.28, creds in `.env`,
  via psql at `/opt/homebrew/opt/libpq/bin/psql`):
  - `select distinct type from asset_file` → exactly `preview`, `thumbnail`,
    `encoded_video` — §4's hardcoded values are confirmed.
  - `pg_extension` contains `vchord` (and `vector`, `pg_trgm`, `unaccent`) —
    §1's vchord detection query is correct as written.
  - Bonus shape checks (information_schema): `tag_closure(id_ancestor,
    id_descendant)`, `ocr_search(assetId, text)`, `asset_face` has
    `deletedAt`/`isVisible`/`personId`, `album_asset(albumId, assetId, …)`,
    `smart_search(assetId, embedding)`, and `f_unaccent` exists — all match
    the design. No surprises; nothing in the plan needs adjusting.
  - No code changed. Next: implement `src/lib/server/search.ts` (§1–§9);
    suggested first slice if too big for one pass: scalar translators (§3) +
    combinator walk (§2) + `collectFields`, then relations/derived (§5–§6),
    then assembly/sort/enrichment (§1, §7, §8), then tests.

## Documented behaviors (comments in code, not new decisions)

- SQL three-valued logic under `not`/`ne` on nullable columns (exif fields,
  stackId): NULL rows don't match either polarity unless `eq/ne: null` is used.
- `ownerIds.all` with >1 id is constant-false; `ownerIds.exists` is constant.
- `random` sort has no stable pagination.
- Assets without a smart_search embedding never match when a `query` is present.
