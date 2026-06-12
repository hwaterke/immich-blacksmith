import type {AssetResponseDto, ExifResponseDto} from '@immich/sdk'
import {describe, expect, it} from 'vitest'
import {
  buildComparisonModel,
  buildExifRows,
  exifTones,
  isFilesystemTag,
} from './assetComparison'
import type {ExifTags} from './exif'

/* ── helpers ── */

let seq = 0

function makeAsset(
  exif: Partial<ExifResponseDto> = {},
  overrides: Partial<AssetResponseDto> = {},
): AssetResponseDto {
  const id = overrides.id ?? `asset-${seq++}`
  return {
    id,
    originalFileName: overrides.originalFileName ?? `${id}.jpg`,
    originalPath: overrides.originalPath ?? `/library/${id}.jpg`,
    localDateTime: overrides.localDateTime ?? null,
    exifInfo: exif as ExifResponseDto,
    ...overrides,
  } as AssetResponseDto
}

function specRow(assets: AssetResponseDto[], label: string) {
  const row = buildComparisonModel(assets).specRows.find(
    (r) => r.label === label,
  )
  if (!row) throw new Error(`spec row not found: ${label}`)
  return row
}

function tones(assets: AssetResponseDto[], label: string) {
  return specRow(assets, label).cells.map((c) => c.tone)
}

/* ── Date taken: the new "same" comparison ── */

describe('Date taken tone (same comparison)', () => {
  const ref = '2024-01-01T10:00:00+01:00'

  it('all values identical → no tone', () => {
    const assets = [
      makeAsset({dateTimeOriginal: ref}),
      makeAsset({dateTimeOriginal: ref}),
      makeAsset({dateTimeOriginal: ref}),
    ]
    expect(tones(assets, 'Date taken')).toEqual([
      undefined,
      undefined,
      undefined,
    ])
  })

  it('some missing, the rest identical → green (best) on the dated columns', () => {
    const assets = [
      makeAsset({dateTimeOriginal: ref}),
      makeAsset({dateTimeOriginal: null}),
      makeAsset({dateTimeOriginal: ref}),
    ]
    expect(tones(assets, 'Date taken')).toEqual(['best', undefined, 'best'])
  })

  it('values differ → neutral on present columns, red on the missing one', () => {
    const assets = [
      makeAsset({dateTimeOriginal: ref}),
      makeAsset({dateTimeOriginal: '2024-02-02T12:00:00+01:00'}),
      makeAsset({dateTimeOriginal: null}),
    ]
    expect(tones(assets, 'Date taken')).toEqual(['neutral', 'neutral', 'worst'])
  })

  it('compares the raw timestamp string: same instant, different tz → different', () => {
    const assets = [
      makeAsset({dateTimeOriginal: '2024-01-01T12:00:00+01:00'}),
      makeAsset({dateTimeOriginal: '2024-01-01T11:00:00+00:00'}),
    ]
    expect(tones(assets, 'Date taken')).toEqual(['neutral', 'neutral'])
  })

  it('falls back to localDateTime when exif date is absent', () => {
    const assets = [
      makeAsset({}, {localDateTime: ref}),
      makeAsset({}, {localDateTime: ref}),
    ]
    expect(tones(assets, 'Date taken')).toEqual([undefined, undefined])
  })

  it('a single dated column among missing ones → green on the dated one', () => {
    const assets = [
      makeAsset({dateTimeOriginal: null}),
      makeAsset({dateTimeOriginal: ref}),
      makeAsset({dateTimeOriginal: null}),
    ]
    expect(tones(assets, 'Date taken')).toEqual([undefined, 'best', undefined])
  })

  it('all missing → nothing toned', () => {
    const assets = [
      makeAsset({dateTimeOriginal: null}),
      makeAsset({dateTimeOriginal: null}),
    ]
    expect(tones(assets, 'Date taken')).toEqual([undefined, undefined])
  })
})

/* ── max comparison: best=highest, worst=lowest ── */

describe('max comparison (File size)', () => {
  it('flags only the largest (best) and smallest (worst); middle untoned', () => {
    const assets = [
      makeAsset({fileSizeInByte: 2000}),
      makeAsset({fileSizeInByte: 5000}),
      makeAsset({fileSizeInByte: 1000}),
    ]
    expect(tones(assets, 'File size')).toEqual([undefined, 'best', 'worst'])
  })

  it('all equal → no tone', () => {
    const assets = [
      makeAsset({fileSizeInByte: 1000}),
      makeAsset({fileSizeInByte: 1000}),
    ]
    expect(tones(assets, 'File size')).toEqual([undefined, undefined])
  })
})

/* ── diff comparison: neutral when a column differs from the reference (col 0) ── */

describe('diff comparison (Camera)', () => {
  it('flags columns that differ from the reference', () => {
    const assets = [
      makeAsset({make: 'Canon', model: 'R5'}),
      makeAsset({make: 'Canon', model: 'R5'}),
      makeAsset({make: 'Sony', model: 'A7'}),
    ]
    expect(tones(assets, 'Camera')).toEqual([undefined, undefined, 'neutral'])
  })
})

/* ── builder aggregates ── */

describe('buildComparisonModel aggregates', () => {
  it('reports the reference column and total size', () => {
    const assets = [
      makeAsset({fileSizeInByte: 1024}),
      makeAsset({fileSizeInByte: 1024}),
    ]
    const model = buildComparisonModel(assets)
    expect(model.columns[0].isReference).toBe(true)
    expect(model.columns[1].isReference).toBe(false)
    expect(model.totalSize).toBe('2.0 KB')
  })

  it('marks Immich-suggested keepers as recommended', () => {
    const a = makeAsset({}, {id: 'keep-me'})
    const b = makeAsset({}, {id: 'drop-me'})
    const model = buildComparisonModel([a, b], {suggestedKeepIds: ['keep-me']})
    expect(model.columns.map((c) => c.isRecommended)).toEqual([true, false])
  })
})

/* ── EXIF tone rule (shared with the "same" comparison) ── */

describe('exifTones', () => {
  it('all values the same → no tone', () => {
    expect(exifTones(['A', 'A', 'A'])).toEqual([
      undefined,
      undefined,
      undefined,
    ])
  })

  it('all missing except one → green on the present one', () => {
    expect(exifTones([null, 'A', null])).toEqual([undefined, 'best', undefined])
  })

  it('several share a value, one missing → green on the matches, missing untoned', () => {
    expect(exifTones(['A', 'A', null])).toEqual(['best', 'best', undefined])
  })

  it('values differ → neutral on present, red on the missing', () => {
    expect(exifTones(['A', 'B', null])).toEqual(['neutral', 'neutral', 'worst'])
  })

  it('all present but differ → neutral everywhere', () => {
    expect(exifTones(['A', 'B', 'C'])).toEqual([
      'neutral',
      'neutral',
      'neutral',
    ])
  })
})

describe('isFilesystemTag', () => {
  it('flags SourceFile and filesystem path/date tags', () => {
    expect(isFilesystemTag('SourceFile')).toBe(true)
    expect(isFilesystemTag('File:System:FileName')).toBe(true)
    expect(isFilesystemTag('File:System:Directory')).toBe(true)
    expect(isFilesystemTag('File:System:FileModifyDate')).toBe(true)
  })

  it('keeps meaningful tags', () => {
    expect(isFilesystemTag('EXIF:IFD0:Make')).toBe(false)
    expect(isFilesystemTag('File:System:FileSize')).toBe(false)
  })
})

describe('buildExifRows', () => {
  it('builds the union of keys in first-seen order, excluding filesystem tags', () => {
    const a: ExifTags = {
      SourceFile: '/a.jpg',
      'EXIF:IFD0:Make': 'Canon',
      'EXIF:IFD0:Model': 'R5',
    }
    const b: ExifTags = {
      SourceFile: '/b.jpg',
      'EXIF:IFD0:Make': 'Canon',
      'EXIF:Photo:ISO': 100,
    }
    const rows = buildExifRows([a, b])
    expect(rows.map((r) => r.label)).toEqual([
      'EXIF:IFD0:Make',
      'EXIF:IFD0:Model',
      'EXIF:Photo:ISO',
    ])
  })

  it('renders missing values as "—" and tones each row by the shared rule', () => {
    const a: ExifTags = {'EXIF:IFD0:Make': 'Canon', 'EXIF:Photo:ISO': 100}
    const b: ExifTags = {'EXIF:IFD0:Make': 'Sony'}
    const rows = buildExifRows([a, b])

    const make = rows.find((r) => r.label === 'EXIF:IFD0:Make')!
    expect(make.cells.map((c) => c.value)).toEqual(['Canon', 'Sony'])
    expect(make.cells.map((c) => c.tone)).toEqual(['neutral', 'neutral'])

    const iso = rows.find((r) => r.label === 'EXIF:Photo:ISO')!
    expect(iso.cells.map((c) => c.value)).toEqual(['100', '—'])
    expect(iso.cells.map((c) => c.tone)).toEqual(['best', undefined])
  })

  it('treats a column that failed to load (undefined) as all-missing', () => {
    const a: ExifTags = {'EXIF:IFD0:Make': 'Canon'}
    const rows = buildExifRows([a, undefined])
    const make = rows[0]
    expect(make.cells.map((c) => c.value)).toEqual(['Canon', '—'])
    expect(make.cells.map((c) => c.tone)).toEqual(['best', undefined])
  })
})
