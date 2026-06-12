import {describe, expect, it} from 'vitest'
import {searchSchema} from './searchTypes'

describe('searchSchema', () => {
  describe('defaults', () => {
    it('applies defaults for sort, pagination and joins', () => {
      const result = searchSchema.parse({filters: {}})
      expect(result.sort).toEqual({field: 'fileCreatedAt', direction: 'desc'})
      expect(result.pagination).toEqual({page: 1, size: 10})
      expect(result.joins).toEqual([])
    })

    it('accepts an empty top-level filter as match-all', () => {
      expect(() => searchSchema.parse({filters: {}})).not.toThrow()
    })
  })

  describe('id filters', () => {
    it('accepts eq, ne, any and none', () => {
      const uuid = '123e4567-e89b-42d3-a456-426614174000'
      expect(() =>
        searchSchema.parse({
          filters: {id: {any: [uuid]}, libraryId: {ne: uuid}},
        }),
      ).not.toThrow()
    })

    it('accepts null for IS NULL semantics', () => {
      expect(() =>
        searchSchema.parse({
          filters: {
            libraryId: {eq: null},
            stackId: {eq: null},
            duplicateId: {ne: null},
          },
        }),
      ).not.toThrow()
    })

    it('rejects non-UUID values', () => {
      expect(() =>
        searchSchema.parse({filters: {id: {eq: 'not-a-uuid'}}}),
      ).toThrow()
    })
  })

  describe('relation filters', () => {
    it('accepts any, all, none and exists', () => {
      const uuid = '123e4567-e89b-42d3-a456-426614174000'
      expect(() =>
        searchSchema.parse({
          filters: {
            albumIds: {all: [uuid], none: [uuid]},
            personIds: {exists: true},
            tagIds: {exists: false},
          },
        }),
      ).not.toThrow()
    })

    it('rejects empty arrays', () => {
      expect(() =>
        searchSchema.parse({filters: {albumIds: {any: []}}}),
      ).toThrow()
    })
  })

  describe('string filters', () => {
    it('accepts pattern operators', () => {
      expect(() =>
        searchSchema.parse({
          filters: {
            city: {contains: 'york'},
            make: {eq: 'Canon'},
            originalFileName: {startsWith: 'IMG_', endsWith: '.jpg'},
          },
        }),
      ).not.toThrow()
    })

    it('accepts null eq for IS NULL semantics', () => {
      expect(() =>
        searchSchema.parse({filters: {city: {eq: null}}}),
      ).not.toThrow()
    })

    it('rejects unknown operators', () => {
      expect(() => searchSchema.parse({filters: {city: {like: 'x'}}})).toThrow()
    })
  })

  describe('checksum filter', () => {
    it('accepts a 40-char hex checksum', () => {
      expect(() =>
        searchSchema.parse({filters: {checksum: {eq: 'a'.repeat(40)}}}),
      ).not.toThrow()
    })

    it('accepts a 28-char base64 checksum', () => {
      expect(() =>
        searchSchema.parse({
          filters: {checksum: {eq: 'Kq5sNclPz7QV2+lfQIuc6R7oRu0='}},
        }),
      ).not.toThrow()
    })

    it('rejects malformed checksums', () => {
      expect(() =>
        searchSchema.parse({filters: {checksum: {eq: 'not-a-checksum'}}}),
      ).toThrow()
    })
  })

  describe('date filters', () => {
    it('coerces ISO strings to Date', () => {
      // status is set explicitly so filters are not wrapped in the implicit
      // {and: [..., {status: {eq: 'active'}}]} default.
      const result = searchSchema.parse({
        filters: {
          takenAt: {gte: '2024-01-01T00:00:00Z'},
          status: {eq: 'active'},
        },
      })
      if (!('takenAt' in result.filters)) {
        throw new Error('expected takenAt filter')
      }
      expect(result.filters.takenAt?.gte).toBeInstanceOf(Date)
    })

    it('keeps null as null instead of coercing to 1970', () => {
      const result = searchSchema.parse({
        filters: {takenAt: {eq: null}, status: {eq: 'active'}},
      })
      if (!('takenAt' in result.filters)) {
        throw new Error('expected takenAt filter')
      }
      expect(result.filters.takenAt?.eq).toBeNull()
    })

    it('rejects null on range operators', () => {
      expect(() =>
        searchSchema.parse({filters: {takenAt: {gte: null}}}),
      ).toThrow()
    })
  })

  describe('enum filters', () => {
    it('accepts status, visibility and type operators', () => {
      expect(() =>
        searchSchema.parse({
          filters: {
            status: {eq: 'active'},
            visibility: {any: ['timeline', 'archive']},
            type: {ne: 'VIDEO'},
          },
        }),
      ).not.toThrow()
    })

    it('rejects values outside the enum', () => {
      expect(() =>
        searchSchema.parse({filters: {status: {eq: 'purged'}}}),
      ).toThrow()
    })
  })

  describe('ocr filter', () => {
    it('accepts matches and contains', () => {
      expect(() =>
        searchSchema.parse({
          filters: {ocr: {matches: 'receipt', contains: 'total'}},
        }),
      ).not.toThrow()
    })

    it('rejects empty strings', () => {
      expect(() =>
        searchSchema.parse({filters: {ocr: {matches: ''}}}),
      ).toThrow()
    })
  })

  describe('empty operator objects', () => {
    it.each(['id', 'city', 'checksum', 'albumIds', 'takenAt', 'status', 'ocr'])(
      'rejects %s: {}',
      (field) => {
        expect(() => searchSchema.parse({filters: {[field]: {}}})).toThrow()
      },
    )
  })

  describe('combinators', () => {
    it('accepts nested and/or/not', () => {
      expect(() =>
        searchSchema.parse({
          filters: {
            or: [
              {isFavorite: true},
              {
                and: [
                  {ocr: {matches: 'receipt'}},
                  {not: {type: {eq: 'VIDEO'}}},
                ],
              },
            ],
          },
        }),
      ).not.toThrow()
    })

    it('rejects mixing field filters with combinators at the same level', () => {
      expect(() =>
        searchSchema.parse({
          filters: {isFavorite: true, or: [{isMotion: true}]},
        }),
      ).toThrow()
    })

    it('rejects unknown combinator keys', () => {
      expect(() =>
        searchSchema.parse({filters: {nor: [{isFavorite: true}]}}),
      ).toThrow()
    })
  })

  describe('status default', () => {
    it('injects status: {eq: active} when status is not mentioned', () => {
      const result = searchSchema.parse({filters: {isFavorite: true}})
      expect(result.filters).toEqual({
        and: [{isFavorite: true}, {status: {eq: 'active'}}],
      })
    })

    it('does not inject when status is filtered at the top level', () => {
      const result = searchSchema.parse({
        filters: {status: {eq: 'trashed'}},
      })
      expect(result.filters).toEqual({status: {eq: 'trashed'}})
    })

    it('does not inject when status is mentioned inside a combinator', () => {
      const filters = {
        or: [{status: {any: ['trashed', 'deleted']}}, {isFavorite: true}],
      }
      const result = searchSchema.parse({filters})
      expect(result.filters).toEqual(filters)
    })

    it('does not inject when status is mentioned inside not', () => {
      const filters = {not: {status: {eq: 'deleted'}}}
      const result = searchSchema.parse({filters})
      expect(result.filters).toEqual(filters)
    })
  })

  describe('joins', () => {
    it('accepts the singular join names', () => {
      expect(() =>
        searchSchema.parse({
          filters: {},
          joins: ['exif', 'person', 'stack', 'album', 'owner'],
        }),
      ).not.toThrow()
    })

    it('rejects the old plural album naming', () => {
      expect(() =>
        searchSchema.parse({filters: {}, joins: ['albums']}),
      ).toThrow()
    })
  })

  describe('query', () => {
    const uuid = '123e4567-e89b-42d3-a456-426614174000'

    it('accepts a text query and defaults sort to distance asc', () => {
      const result = searchSchema.parse({
        filters: {},
        query: {text: 'cats playing'},
      })
      expect(result.sort).toEqual({field: 'distance', direction: 'asc'})
    })

    it('accepts an assetId query', () => {
      expect(() =>
        searchSchema.parse({filters: {}, query: {assetId: uuid}}),
      ).not.toThrow()
    })

    it('rejects text and assetId together', () => {
      expect(() =>
        searchSchema.parse({
          filters: {},
          query: {text: 'cats', assetId: uuid},
        }),
      ).toThrow()
    })

    it('rejects an empty query', () => {
      expect(() => searchSchema.parse({filters: {}, query: {}})).toThrow()
    })

    it('rejects language together with assetId', () => {
      expect(() =>
        searchSchema.parse({
          filters: {},
          query: {assetId: uuid, language: 'en'},
        }),
      ).toThrow()
    })

    it('accepts language together with text', () => {
      expect(() =>
        searchSchema.parse({
          filters: {},
          query: {text: 'chats', language: 'fr'},
        }),
      ).not.toThrow()
    })

    it('rejects out-of-range maxDistance', () => {
      expect(() =>
        searchSchema.parse({
          filters: {},
          query: {text: 'cats', maxDistance: 0},
        }),
      ).toThrow()
      expect(() =>
        searchSchema.parse({
          filters: {},
          query: {text: 'cats', maxDistance: 2.5},
        }),
      ).toThrow()
    })

    it('rejects distance sort without a query', () => {
      expect(() =>
        searchSchema.parse({filters: {}, sort: {field: 'distance'}}),
      ).toThrow()
    })

    it('rejects a non-distance sort with a query unless maxDistance is set', () => {
      expect(() =>
        searchSchema.parse({
          filters: {},
          query: {text: 'cats'},
          sort: {field: 'fileCreatedAt'},
        }),
      ).toThrow()
      expect(() =>
        searchSchema.parse({
          filters: {},
          query: {text: 'cats', maxDistance: 0.5},
          sort: {field: 'fileCreatedAt'},
        }),
      ).not.toThrow()
    })

    it('allows explicit distance sort with a query and defaults direction to asc', () => {
      const result = searchSchema.parse({
        filters: {},
        query: {text: 'cats'},
        sort: {field: 'distance'},
      })
      expect(result.sort).toEqual({field: 'distance', direction: 'asc'})
    })
  })

  describe('sort and pagination', () => {
    it('accepts the random sort field', () => {
      const result = searchSchema.parse({
        filters: {},
        sort: {field: 'random'},
      })
      expect(result.sort.field).toBe('random')
    })

    it('fails on out-of-range pagination instead of catching', () => {
      expect(() =>
        searchSchema.parse({filters: {}, pagination: {page: 1, size: 5000}}),
      ).toThrow()
      expect(() =>
        searchSchema.parse({filters: {}, pagination: {page: 0, size: 10}}),
      ).toThrow()
    })
  })
})
