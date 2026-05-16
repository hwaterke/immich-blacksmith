import {useState} from 'react'
import {Camera, MapPin, Trash2} from 'lucide-react'
import type {AssetResponseDto} from '@immich/sdk'
import {cn} from '../lib/utils'

interface Props {
  id: string
  asset?: AssetResponseDto
  error?: string
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function formatLocation(
  lat: number | null | undefined,
  lon: number | null | undefined,
  city: string | null | undefined,
  country: string | null | undefined,
): string | null {
  const place = [city, country].filter(Boolean).join(', ')
  const coords =
    lat != null && lon != null ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : null
  if (place && coords) return `${place} (${coords})`
  return place || coords || null
}

export function DuplicateAssetCard({id, asset, error}: Props) {
  const [marked, setMarked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  if (!asset) {
    return (
      <div className="island-shell flex w-[320px] shrink-0 flex-col rounded-2xl border border-red-300/60 p-4">
        <p className="island-kicker mb-2 text-red-600">Asset unavailable</p>
        <p className="text-xs break-all text-[var(--sea-ink-soft)]">{id}</p>
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      </div>
    )
  }

  const exif = asset.exifInfo
  const location = formatLocation(
    exif?.latitude,
    exif?.longitude,
    exif?.city,
    exif?.country,
  )
  const camera = [exif?.make, exif?.model].filter(Boolean).join(' ')
  const dimensions =
    exif?.exifImageWidth && exif?.exifImageHeight
      ? `${exif.exifImageWidth} × ${exif.exifImageHeight}`
      : '—'

  async function handleMark() {
    if (!asset || submitting || marked) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/mark-for-deletion', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({originalPath: asset.originalPath}),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(detail || `Request failed (${res.status})`)
      }
      setMarked(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className={cn(
        'island-shell flex w-[320px] shrink-0 flex-col rounded-2xl p-4 transition',
        marked
          ? 'border-2 border-red-500 bg-red-50/40 opacity-80'
          : 'border border-transparent',
      )}
    >
      <a
        href={`/api/thumbnail/${asset.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-xl bg-black/5"
      >
        <img
          src={`/api/thumbnail/${asset.id}`}
          alt={asset.originalFileName}
          className="h-48 w-full object-cover"
          loading="lazy"
        />
      </a>

      <h3
        className="mt-3 truncate text-sm font-semibold text-[var(--sea-ink)]"
        title={asset.originalFileName}
      >
        {asset.originalFileName}
      </h3>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs text-[var(--sea-ink-soft)]">
        <dt className="font-medium">Size</dt>
        <dd>{formatBytes(exif?.fileSizeInByte)}</dd>

        <dt className="font-medium">Dimensions</dt>
        <dd>{dimensions}</dd>

        <dt className="font-medium">Taken</dt>
        <dd>{formatDate(exif?.dateTimeOriginal ?? asset.localDateTime)}</dd>

        <dt className="font-medium">Uploaded</dt>
        <dd>{formatDate(asset.fileCreatedAt)}</dd>

        <dt className="font-medium">Modified</dt>
        <dd>{formatDate(asset.fileModifiedAt)}</dd>

        {camera ? (
          <>
            <dt className="flex items-center gap-1 font-medium">
              <Camera size={12} /> Camera
            </dt>
            <dd>{camera}</dd>
          </>
        ) : null}

        {location ? (
          <>
            <dt className="flex items-center gap-1 font-medium">
              <MapPin size={12} /> Location
            </dt>
            <dd className="break-words">{location}</dd>
          </>
        ) : null}
      </dl>

      <p
        className="mt-3 break-all rounded-md bg-black/5 p-2 font-mono text-[10px] text-[var(--sea-ink-soft)]"
        title={asset.originalPath}
      >
        {asset.originalPath}
      </p>

      <button
        type="button"
        onClick={handleMark}
        disabled={submitting || marked}
        className={cn(
          'mt-3 flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition',
          marked
            ? 'cursor-not-allowed bg-red-200 text-red-900'
            : 'bg-red-500 text-white hover:bg-red-600 disabled:opacity-60',
        )}
      >
        <Trash2 size={14} />
        {marked
          ? 'Marked for deletion'
          : submitting
            ? 'Marking…'
            : 'Mark for deletion'}
      </button>

      {submitError ? (
        <p className="mt-2 text-xs text-red-600">{submitError}</p>
      ) : null}
    </div>
  )
}
