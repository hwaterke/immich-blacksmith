# Notes for the `searchAssets` builder (src/lib/server/search.ts)

Context gathered while designing `src/lib/shared/searchTypes.ts` (June 2026). The
Immich reference implementation is `searchAssetBuilder` in
`/Users/harold/Developer/immich/server/src/utils/database.ts` (~line 374) — steal
its join/subquery shapes liberally.

## Schema contract (already enforced by Zod — don't re-validate)

- `searchSchema.parse()` output: `sort` is always resolved (`distance asc` when a
  `query` is present and no explicit sort; `fileCreatedAt desc` otherwise).
- `query` has exactly one of `text` / `assetId`; a non-distance sort with a query
  guarantees `maxDistance` is set.
- **Trashed assets are excluded by default, already materialized in the parsed
  output**: when `status` is not mentioned anywhere in the filter tree, the
  transform rewrites `filters` to `{and: [filters, {status: {eq: 'active'}}]}`.
  The builder needs no special handling — just translate what it gets. Any
  explicit `status` filter (even nested in `or`/`not`) disables the injection.
- Operator objects are never empty; unknown operators are rejected.
- `eq: null` / `ne: null` mean `IS NULL` / `IS NOT NULL` (ids, strings, dates).

## Filter → SQL mapping

- **Combinators**: `filters` is a union — either a field object (all fields AND,
  multiple operators on one field AND) or `{and: [...]}` / `{or: [...]}` /
  `{not: ...}`, recursive. Walk with Kysely `eb.and` / `eb.or` / `eb.not`.
- **Asset columns**: id, libraryId, stackId, duplicateId, ownerIds (= `asset.ownerId`,
  plain column despite the plural name), isFavorite, isOffline, isExternal, isEdited,
  status, visibility, type, checksum, originalFileName, originalPath, createdAt,
  updatedAt, trashedAt (= `asset.deletedAt`), fileCreatedAt, fileModifiedAt,
  localDateTime.
- **asset_exif**: city, state, country, make, model, lensModel, description,
  takenAt (= `dateTimeOriginal`). Sort fields `takenAt` and `fileSize`
  (= `fileSizeInByte`) also need this join. Join lazily — only when referenced.
- **asset_file**: previewPath / thumbnailPath / encodedVideoPath are NOT asset
  columns — they're rows in `asset_file` (`type` + `path`). Verify the exact `type`
  values in the DB before implementing. `isEncoded` / `isMotion` are derived
  (encoded video file exists / `livePhotoVideoId IS NOT NULL`).
- **Relations** (`any/all/none/exists`): albumIds via `album_asset`; personIds via
  `asset_face` (mind `deletedAt`); tagIds via `tag_asset` — note Immich uses
  `tag_closure` so a parent tag matches children; decide whether to replicate.
  Prefer `EXISTS` subqueries over joins to avoid row duplication; `all` needs a
  grouped count (see Immich's `hasTags`/`hasPeople`).
- **Strings**: pattern ops are case-insensitive → ILIKE, escape `%`/`_` in user
  input. Immich wraps `originalFileName` matching in `f_unaccent(...)` to hit the
  trigram index — use the same expression or the index won't be used.
- **checksum**: decode to Buffer before comparing the bytea column —
  `length === 28 ? 'base64' : 'hex'` (40-char hex), same as Immich.
- **ocr**: `matches` → trigram word similarity on `ocr_search.text`, Immich does
  `f_unaccent(ocr_search.text) %>> f_unaccent(<tokenized query>)`; `contains` →
  plain ILIKE.

## Smart search (query)

- Resolve the embedding with `getQueryEmbedding(params.query)` from
  `src/lib/server/embedding.ts` (handles text→ML-service and assetId→smart_search;
  needs `MACHINE_LEARNING_URL` for text).
- `innerJoin('smart_search', 'asset.id', 'smart_search.assetId')`, distance
  expression: `` sql<number>`smart_search.embedding <=> ${embedding}` ``.
- `maxDistance` → CTE then `where('distance', '<=', ...)` — same shape as
  `findSimilarAssetIds` in `src/lib/assetQueries.ts` (can't reference a select
  alias in WHERE directly).
- VectorChord needs `set local vchordrq.probes = 1` inside a transaction before
  the query (Immich: search.repository.ts ~line 286). Detect the extension once
  via `select extname from pg_extension` and cache; skip for plain pgvector.
  The `immich_readonly` user can do both.

## Parked decisions

- **random sort**: just `ORDER BY random()`; no stable pagination across pages —
  acceptable or document it.

## joins

- `['exif', 'person', 'stack', 'album', 'owner']` (singular, normalized). These
  are _response enrichment_ joins, independent of filter-driven joins — avoid
  double-joining exif.

## Misc

- Add `asset.id` as a secondary ORDER BY for stable pagination on non-unique sort
  fields.
- Consider Immich's `limit(size + 1)` trick to return `hasNextPage` cheaply.
- Schema tests live in `src/lib/shared/searchTypes.test.ts`, embedding tests in
  `src/lib/server/embedding.test.ts`. `pnpm typecheck` has pre-existing
  errors in the search.ts stub, `src/routes/sanity-check.tsx` and
  `data/query-to-delete.ts` — anything else is new.
