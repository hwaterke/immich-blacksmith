import {describe, expect, it} from 'vitest'
import {db} from './db'
import {searchSchema} from '../shared/searchTypes'
import {buildSearchQuery} from './search'

// RFC-shaped v4 UUIDs (zod v4 validates the version/variant nibbles).
const u1 = '11111111-1111-4111-8111-111111111111'
const u2 = '22222222-2222-4222-9222-222222222222'

// Compiles a query without connecting to the DB: Kysely's `.compile()` only
// produces SQL + parameters, so these are pure unit tests.
const compile = (params: unknown, embedding?: string) =>
  buildSearchQuery(db, searchSchema.parse(params), embedding).compile()

describe('buildSearchQuery', () => {
  describe('base query, status default and pagination', () => {
    it('selects asset.*, injects status: active, and probes for a next page', () => {
      const {sql, parameters} = compile({filters: {}})
      expect(sql).toContain('select "asset".* from "asset"')
      // An empty filter object is the always-true `1 = 1`, ANDed with the
      // injected active-status default.
      expect(sql).toContain('(1 = 1 and "asset"."status" = $1)')
      // limit = size + 1 (10 + 1) and offset 0 for page 1.
      expect(parameters).toEqual(['active', 11, 0])
      // No exif left join when nothing references it.
      expect(sql).not.toContain('asset_exif')
    })

    it('computes limit/offset from page and size', () => {
      const {parameters} = compile({
        filters: {},
        pagination: {page: 3, size: 20},
      })
      // limit = 21, offset = (3 - 1) * 20 = 40
      expect(parameters).toEqual(['active', 21, 40])
    })

    it('adds a stable secondary order on asset.id', () => {
      const {sql} = compile({filters: {}})
      expect(sql).toContain(
        'order by "asset"."fileCreatedAt" desc, "asset"."id"',
      )
    })
  })

  describe('combinator composition', () => {
    it('nests or/not as parenthesised boolean expressions', () => {
      const {sql} = compile({
        filters: {or: [{isFavorite: true}, {not: {type: {eq: 'VIDEO'}}}]},
      })
      expect(sql).toContain(
        '("asset"."isFavorite" = $1 or not "asset"."type" = $2)',
      )
    })
  })

  describe('relation filters (EXISTS shapes)', () => {
    it('emits correlated EXISTS for any/all/none and a constant for ownerIds.exists', () => {
      const {sql} = compile({
        filters: {
          albumIds: {any: [u1]},
          personIds: {all: [u1]},
          tagIds: {none: [u1]},
          ownerIds: {exists: true},
        },
      })
      // any → EXISTS with an id predicate.
      expect(sql).toContain(
        'exists (select from "album_asset" where "album_asset"."assetId" = "asset"."id" and "album_asset"."albumId" in',
      )
      // people are always gated on non-deleted, visible faces.
      expect(sql).toContain('"asset_face"."deletedAt" is null')
      expect(sql).toContain('"asset_face"."isVisible" = ')
      // all → grouped distinct-count EXISTS.
      expect(sql).toContain(
        'group by "asset_face"."assetId" having count(distinct "asset_face"."personId") =',
      )
      // none → NOT EXISTS, tags via the closure join on the ancestor.
      expect(sql).toContain(
        'not exists (select from "tag_asset" inner join "tag_closure" on "tag_asset"."tagId" = "tag_closure"."id_descendant"',
      )
      expect(sql).toContain('"tag_closure"."id_ancestor" in')
      // ownerIds.exists is a plain non-nullable column, so a constant.
      expect(sql).toContain('and true')
    })

    it('counts the closure ancestor for tagIds.all', () => {
      const {sql, parameters} = compile({filters: {tagIds: {all: [u1, u2]}}})
      expect(sql).toContain(
        'having count(distinct "tag_closure"."id_ancestor") =',
      )
      // The count target equals the number of requested ids.
      expect(parameters).toContain(2)
    })

    it('degenerates ownerIds.all with more than one id to constant false', () => {
      const {sql, parameters} = compile({filters: {ownerIds: {all: [u1, u2]}}})
      expect(sql).toContain('(false and "asset"."status" = $1)')
      // The owner ids never reach the query as parameters.
      expect(parameters).not.toContain(u1)
    })
  })

  describe('string, ocr and checksum operators', () => {
    it('wraps originalFileName in f_unaccent for the trigram index', () => {
      const {sql, parameters} = compile({
        filters: {originalFileName: {contains: 'café'}},
      })
      expect(sql).toContain(
        `f_unaccent(asset."originalFileName") ilike '%' || f_unaccent($1) || '%'`,
      )
      expect(parameters).toContain('café')
    })

    it('uses the %>> word-similarity operator for ocr.matches', () => {
      const {sql} = compile({filters: {ocr: {matches: 'receipt'}}})
      expect(sql).toContain(
        'exists (select from "ocr_search" where "ocr_search"."assetId" = "asset"."id" and f_unaccent(ocr_search.text) %>> f_unaccent($1))',
      )
    })

    it('decodes a hex checksum to a bytea Buffer parameter', () => {
      const {parameters} = compile({filters: {checksum: {eq: 'a'.repeat(40)}}})
      const checksum = parameters[0]
      expect(Buffer.isBuffer(checksum)).toBe(true)
      // 40 hex chars → 20 bytes, each 0xaa.
      expect(checksum).toEqual(Buffer.alloc(20, 0xaa))
    })
  })

  describe('smart search', () => {
    const embedding = '[0.1,0.2,0.3]'

    it('joins smart_search, selects distance, orders by it asc, and applies maxDistance', () => {
      const {sql, parameters} = compile(
        {
          filters: {},
          query: {text: 'cats', maxDistance: 0.5},
          sort: {field: 'distance'},
        },
        embedding,
      )
      expect(sql).toContain(
        'inner join "smart_search" on "smart_search"."assetId" = "asset"."id"',
      )
      expect(sql).toContain('smart_search.embedding <=> $1 as "distance"')
      // maxDistance repeats the raw distance expression in WHERE.
      expect(sql).toMatch(/and smart_search\.embedding <=> \$\d+ <= \$\d+/)
      expect(sql).toMatch(
        /order by smart_search\.embedding <=> \$\d+ asc, "asset"\."id"/,
      )
      expect(parameters).toContain(0.5)
    })

    it('omits the smart_search join when there is no embedding', () => {
      const {sql} = compile({filters: {}})
      expect(sql).not.toContain('smart_search')
    })
  })

  describe('enrichment joins', () => {
    it('emits nested-JSON sub-selects per requested join and never exposes user secrets', () => {
      const {sql} = compile(
        {
          filters: {},
          query: {text: 'cats', maxDistance: 0.5},
          sort: {field: 'distance'},
          joins: ['exif', 'person', 'stack', 'album', 'owner'],
        },
        '[0.1,0.2,0.3]',
      )
      // exif reuses the single left join via to_json.
      expect(sql).toContain('to_json("asset_exif") as "exif"')
      // people are de-duplicated and gated on visible, non-deleted faces.
      expect(sql).toContain('select distinct on ("person"."id") "person".*')
      // stack and albums.
      expect(sql).toContain('as "stack"')
      expect(sql).toContain('as "albums"')
      // owner lists explicit columns only — no password / pinCode.
      expect(sql).toContain(
        '"user"."id", "user"."name", "user"."email", "user"."avatarColor", "user"."profileImagePath"',
      )
      expect(sql).not.toContain('password')
      expect(sql).not.toContain('pinCode')
    })
  })

  describe('sorting', () => {
    it('forces the exif join and keeps NULLs last for takenAt', () => {
      const {sql} = compile({filters: {}, sort: {field: 'takenAt'}})
      expect(sql).toContain(
        'left join "asset_exif" on "asset_exif"."assetId" = "asset"."id"',
      )
      expect(sql).toContain(
        'order by "asset_exif"."dateTimeOriginal" desc nulls last, "asset"."id"',
      )
    })

    it('orders by fileSizeInByte with nulls last', () => {
      const {sql} = compile({filters: {}, sort: {field: 'fileSize'}})
      expect(sql).toContain(
        'order by "asset_exif"."fileSizeInByte" desc nulls last, "asset"."id"',
      )
    })

    it('orders by random() without a secondary key', () => {
      const {sql} = compile({filters: {}, sort: {field: 'random'}})
      expect(sql).toContain('order by random()')
      expect(sql).not.toContain('order by random(), "asset"."id"')
    })
  })
})
