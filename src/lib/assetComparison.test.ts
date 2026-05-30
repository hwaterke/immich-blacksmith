import type {AssetResponseDto, ExifResponseDto} from '@immich/sdk'
import {describe, expect, it} from 'vitest'
import {buildComparisonModel} from './assetComparison'

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

  it('values differ → neutral on every column that has a value', () => {
    const assets = [
      makeAsset({dateTimeOriginal: ref}),
      makeAsset({dateTimeOriginal: '2024-02-02T12:00:00+01:00'}),
      makeAsset({dateTimeOriginal: null}),
    ]
    expect(tones(assets, 'Date taken')).toEqual([
      'neutral',
      'neutral',
      undefined,
    ])
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
