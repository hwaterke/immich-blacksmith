import type {AssetResponseDto, ExifResponseDto} from '@immich/sdk'
import type {ExifTags, JsonValue} from './exif'

/* ──────────────────────────────────────────────────────────────────────────
   Pure comparison logic + view-model builder for the asset comparison table.
   No React here — components consume the ComparisonModel and only render it.
   ────────────────────────────────────────────────────────────────────────── */

export type Tone = 'best' | 'worst' | 'neutral'

export interface ComparisonColumn {
  assetId: string
  originalPath: string
  fileName: string
  thumbnailUrl: string
  immichUrl: string
  /** Column 0 of the set — the reference everything is compared against. */
  isReference: boolean
  /** Immich's suggested keeper for the group. */
  isRecommended: boolean
  /** Vector distance to the reference (null when unavailable). */
  distance: number | null
  /** 0–100, width of the distance bar relative to the farthest match. */
  distanceBarPct: number
}

export interface ComparisonCell {
  value: string
  sub?: string
  tone?: Tone
}

export interface ComparisonRow {
  label: string
  sub?: string
  /** One cell per column, in column order. */
  cells: ComparisonCell[]
}

export interface ComparisonModel {
  columns: ComparisonColumn[]
  specRows: ComparisonRow[]
  /** Total size of every asset in the set, formatted (e.g. "60.6 MB"). */
  totalSize: string
  /** Closest non-reference distance as a match percentage, or null. */
  matchPercent: number | null
}

export interface BuildComparisonOptions {
  /** assetId → vector distance to the reference. */
  distances?: Record<string, number | null | undefined>
  /** Immich's suggestedKeepAssetIds. */
  suggestedKeepIds?: string[]
  immichWebUrl?: string
}

/* ── formatters ── */

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatDimensions(
  w: number | null | undefined,
  h: number | null | undefined,
): string {
  return w && h ? `${w} × ${h}` : '—'
}

export function megapixels(
  w: number | null | undefined,
  h: number | null | undefined,
): number {
  if (!w || !h) return 0
  return (w * h) / 1_000_000
}

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

export function formatDatePart(value: string | null | undefined): string {
  const d = asDate(value)
  return d ? d.toLocaleDateString('fr-BE') : '—'
}

export function formatTimePart(value: string | null | undefined): string {
  const d = asDate(value)
  return d ? d.toLocaleTimeString('fr-BE') : '—'
}

export function formatCamera(
  make: string | null | undefined,
  model: string | null | undefined,
): string {
  const v = [make, model].filter(Boolean).join(' ')
  return v || '—'
}

export function formatLens(exif: ExifResponseDto | undefined): string {
  if (!exif) return '—'
  const parts: string[] = []
  if (exif.lensModel) parts.push(exif.lensModel)
  const tech = [
    exif.focalLength ? `${exif.focalLength} mm` : null,
    exif.fNumber ? `ƒ/${exif.fNumber}` : null,
  ]
    .filter(Boolean)
    .join('  ')
  if (tech) parts.push(tech)
  return parts.join(' · ') || '—'
}

export function formatLocation(exif: ExifResponseDto | undefined): string {
  if (!exif) return '—'
  const place = [exif.city, exif.state, exif.country].filter(Boolean).join(', ')
  const coords =
    exif.latitude != null && exif.longitude != null
      ? `${exif.latitude.toFixed(5)}, ${exif.longitude.toFixed(5)}`
      : null
  if (place && coords) return `${place} (${coords})`
  return place || coords || '—'
}

/* ── format ranking (RAW > TIFF > PNG > HEIC > JPEG …) ── */

const FMT_RANK: Record<string, number> = {
  RAW: 5,
  DNG: 5,
  NEF: 5,
  CR2: 5,
  CR3: 5,
  ARW: 5,
  RAF: 5,
  RW2: 5,
  ORF: 5,
  TIFF: 4,
  TIF: 4,
  PNG: 3,
  HEIC: 2,
  HEIF: 2,
  WEBP: 2,
  JPEG: 1,
  JPG: 1,
}

const LOSSLESS = new Set([
  'RAW',
  'DNG',
  'NEF',
  'CR2',
  'CR3',
  'ARW',
  'RAF',
  'RW2',
  'ORF',
  'TIFF',
  'TIF',
  'PNG',
])

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0) return ''
  return fileName.slice(dot + 1).toUpperCase()
}

export function rankFmt(ext: string): number {
  return FMT_RANK[ext] ?? 1
}

/* ── tone computation (mirrors the design's colTones) ──
   'max'/'min' rank columns and flag the best & worst extremes;
   'diff' flags columns whose value differs from the reference (col 0). */
type Cmp = 'max' | 'min' | 'diff' | 'same'

function colTones(
  cmp: Cmp,
  keys: number[],
  refMatches: boolean[],
  idents: (string | null)[],
): Tone[] {
  const tones: Tone[] = keys.map(() => undefined as unknown as Tone)
  if (cmp === 'same') {
    const present = idents.map((v) => v != null && v !== '')
    const presentValues = idents.filter((_, i) => present[i]) as string[]
    const allSame = presentValues.every((v) => v === presentValues[0])
    const anyMissing = present.some((p) => !p)
    present.forEach((isPresent, i) => {
      if (!allSame) {
        // values differ → neutral on present, red on the missing ones
        tones[i] = isPresent ? 'neutral' : 'worst'
      } else if (isPresent && anyMissing) {
        tones[i] = 'best' // present & all-same but some missing → green
      }
      // missing while all-same → untoned; all present & same → untoned
    })
    return tones
  }
  if (cmp === 'diff') {
    refMatches.forEach((matchesRef, i) => {
      if (!matchesRef) tones[i] = 'neutral'
    })
    return tones
  }
  const max = Math.max(...keys)
  const min = Math.min(...keys)
  if (max === min) return tones // all equal → nothing to flag
  const bestV = cmp === 'max' ? max : min
  const worstV = cmp === 'max' ? min : max
  keys.forEach((v, i) => {
    if (v === bestV) tones[i] = 'best'
    else if (v === worstV) tones[i] = 'worst'
  })
  return tones
}

interface SpecDef {
  label: string
  cmp: Cmp
  /** Numeric sort key for max/min comparisons. */
  key: (a: AssetResponseDto) => number
  /** String identity for diff comparisons. */
  ident?: (a: AssetResponseDto) => string
  value: (a: AssetResponseDto) => string
  sub?: (a: AssetResponseDto) => string | undefined
}

const SPECS: SpecDef[] = [
  {
    label: 'Resolution',
    cmp: 'max',
    key: (a) =>
      megapixels(a.exifInfo?.exifImageWidth, a.exifInfo?.exifImageHeight),
    value: (a) =>
      formatDimensions(a.exifInfo?.exifImageWidth, a.exifInfo?.exifImageHeight),
    sub: (a) => {
      const mp = megapixels(
        a.exifInfo?.exifImageWidth,
        a.exifInfo?.exifImageHeight,
      )
      return mp ? `${mp.toFixed(1)} MP` : undefined
    },
  },
  {
    label: 'File size',
    cmp: 'max',
    key: (a) => a.exifInfo?.fileSizeInByte ?? 0,
    value: (a) => formatBytes(a.exifInfo?.fileSizeInByte),
  },
  {
    label: 'Format',
    cmp: 'max',
    key: (a) => rankFmt(fileExtension(a.originalFileName)),
    value: (a) => fileExtension(a.originalFileName) || '—',
    sub: (a) =>
      LOSSLESS.has(fileExtension(a.originalFileName)) ? 'lossless' : 'lossy',
  },
  {
    label: 'Date taken',
    cmp: 'same',
    key: () => 0,
    ident: (a) => a.exifInfo?.dateTimeOriginal ?? a.localDateTime ?? '',
    value: (a) =>
      formatDatePart(a.exifInfo?.dateTimeOriginal ?? a.localDateTime),
    sub: (a) => formatTimePart(a.exifInfo?.dateTimeOriginal ?? a.localDateTime),
  },
  {
    label: 'Camera',
    cmp: 'diff',
    key: () => 0,
    ident: (a) => formatCamera(a.exifInfo?.make, a.exifInfo?.model),
    value: (a) => formatCamera(a.exifInfo?.make, a.exifInfo?.model),
  },
  {
    label: 'Lens',
    cmp: 'diff',
    key: () => 0,
    ident: (a) => formatLens(a.exifInfo),
    value: (a) => formatLens(a.exifInfo),
  },
  {
    label: 'Location',
    cmp: 'diff',
    key: () => 0,
    ident: (a) => formatLocation(a.exifInfo),
    value: (a) => formatLocation(a.exifInfo),
  },
]

/* ── EXIF rows (from live exiftool output, compared across columns) ──
   Data is the flat, group-qualified tag map exiftool emits (keys like
   `EXIF:IFD0:Make`). Rows are toned with the shared `'same'` rule. */

/** Render a raw exiftool value as a string. Objects/arrays are JSON-encoded. */
export function formatExifValue(value: JsonValue | undefined): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Filesystem tags that always differ between two copies — excluded so the
 *  diff isn't drowned in red. Matched on the leaf name (after the last `:`). */
const FILESYSTEM_TAG_LEAVES = new Set([
  'FileName',
  'Directory',
  'FileModifyDate',
  'FileAccessDate',
  'FileInodeChangeDate',
  'FilePermissions',
])

export function isFilesystemTag(key: string): boolean {
  if (key === 'SourceFile') return true
  const leaf = key.slice(key.lastIndexOf(':') + 1)
  return FILESYSTEM_TAG_LEAVES.has(leaf)
}

/** Tone one EXIF row by comparing its cell values across columns (shared rule:
 *  same → none, all-same-but-some-missing → green on present, differ → neutral
 *  on present + red on missing). */
export function exifTones(values: (string | null)[]): Tone[] {
  return colTones('same', values.map(() => 0), [], values)
}

/** Build one row per EXIF tag from each column's exiftool tag map (in column
 *  order; `undefined` for columns that failed to load). Keys are the union
 *  across columns in first-seen order, minus filesystem-only tags. */
export function buildExifRows(
  tagMaps: (ExifTags | undefined)[],
): ComparisonRow[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const tags of tagMaps) {
    if (!tags) continue
    for (const key of Object.keys(tags)) {
      if (seen.has(key) || isFilesystemTag(key)) continue
      seen.add(key)
      keys.push(key)
    }
  }

  return keys.map((key) => {
    const values = tagMaps.map((tags) =>
      tags && key in tags ? formatExifValue(tags[key]) : null,
    )
    const tones = exifTones(values)
    return {
      label: key,
      cells: values.map((value, i) => ({
        value: value || '—',
        tone: tones[i],
      })),
    }
  })
}

/* ── builder ── */

export function buildComparisonModel(
  assets: AssetResponseDto[],
  options: BuildComparisonOptions = {},
): ComparisonModel {
  const {distances = {}, suggestedKeepIds = [], immichWebUrl = ''} = options
  const keep = new Set(suggestedKeepIds)

  const distanceValues = assets.map((a) => distances[a.id] ?? null)
  const maxDistance =
    Math.max(0, ...distanceValues.filter((d): d is number => d != null)) || 1

  const columns: ComparisonColumn[] = assets.map((a, i) => {
    const distance = distanceValues[i]
    return {
      assetId: a.id,
      originalPath: a.originalPath,
      fileName: a.originalFileName,
      thumbnailUrl: `/api/thumbnail/${a.id}`,
      immichUrl: `${immichWebUrl}/photos/${a.id}`,
      isReference: i === 0,
      isRecommended: keep.has(a.id),
      distance,
      distanceBarPct: distance != null ? (distance / maxDistance) * 100 : 0,
    }
  })

  const specRows: ComparisonRow[] = SPECS.map((spec) => {
    const keys = assets.map(spec.key)
    const idents = assets.map((a) => (spec.ident ? spec.ident(a) : null))
    const refMatches = assets.map((a) =>
      spec.ident ? spec.ident(a) === idents[0] : true,
    )
    const tones = colTones(spec.cmp, keys, refMatches, idents)
    return {
      label: spec.label,
      cells: assets.map((a, i) => ({
        value: spec.value(a),
        sub: spec.sub ? spec.sub(a) : undefined,
        tone: tones[i],
      })),
    }
  })

  const totalBytes = assets.reduce(
    (sum, a) => sum + (a.exifInfo?.fileSizeInByte ?? 0),
    0,
  )

  const matchDistances = distanceValues
    .slice(1)
    .filter((d): d is number => d != null)
  const matchPercent =
    matchDistances.length > 0
      ? Math.round((1 - Math.min(...matchDistances)) * 100)
      : null

  return {
    columns,
    specRows,
    totalSize: formatBytes(totalBytes),
    matchPercent,
  }
}
