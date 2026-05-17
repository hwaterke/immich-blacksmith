import {useState} from 'react'
import type {MouseEvent, ReactNode} from 'react'
import {
  Camera,
  Check,
  Copy,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import type {AssetResponseDto} from '@immich/sdk'
import {cn} from '../lib/utils'

interface Props {
  id: string
  originalPath?: string
  asset?: AssetResponseDto
  error?: string
  hasEmbedding?: boolean
  distance?: number
  reference?: AssetResponseDto
  label: string
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDatePart(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString('fr-BE')
}

function formatTimePart(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleTimeString('fr-BE')
}

function formatLocation(
  lat: number | null | undefined,
  lon: number | null | undefined,
  city: string | null | undefined,
  country: string | null | undefined,
): string {
  const place = [city, country].filter(Boolean).join(', ')
  const coords =
    lat != null && lon != null ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : null
  if (place && coords) return `${place} (${coords})`
  return place || coords || '—'
}

function formatDimensions(
  w: number | null | undefined,
  h: number | null | undefined,
): string {
  return w && h ? `${w} × ${h}` : '—'
}

function formatCamera(
  make: string | null | undefined,
  model: string | null | undefined,
): string {
  const v = [make, model].filter(Boolean).join(' ')
  return v || '—'
}

function CopyText({
  value,
  className,
  title,
}: {
  value: string
  className?: string
  title?: string
}) {
  const [copied, setCopied] = useState(false)
  async function handleCopy(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* ignore */
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={title ?? 'Click to copy'}
      className={cn(
        'group flex w-full items-start gap-1.5 text-left transition',
        className,
      )}
    >
      <span className="min-w-0 flex-1 break-all">{value}</span>
      {copied ? (
        <Check
          size={13}
          className="mt-0.5 shrink-0"
          style={{color: 'var(--success)'}}
        />
      ) : (
        <Copy
          size={13}
          className="mt-0.5 shrink-0 opacity-50 transition group-hover:opacity-100"
        />
      )}
    </button>
  )
}

function EmbeddingBadge({present}: {present: boolean}) {
  const bg = present ? 'rgba(63, 185, 80, 0.16)' : 'rgba(248, 81, 73, 0.16)'
  const color = present ? 'var(--success)' : 'var(--danger)'
  const border = present ? 'rgba(63, 185, 80, 0.4)' : 'rgba(248, 81, 73, 0.4)'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{background: bg, color, borderColor: border}}
    >
      {present ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
      {present ? 'Embedding' : 'No embedding'}
    </span>
  )
}

function distanceBand(distance: number) {
  if (distance <= 0.005)
    return {
      bg: 'rgba(63, 185, 80, 0.16)',
      color: 'var(--success)',
      border: 'rgba(63, 185, 80, 0.4)',
    }
  if (distance <= 0.015)
    return {
      bg: 'rgba(210, 153, 34, 0.18)',
      color: 'var(--warning)',
      border: 'rgba(210, 153, 34, 0.4)',
    }
  return {
    bg: 'rgba(248, 81, 73, 0.16)',
    color: 'var(--danger)',
    border: 'rgba(248, 81, 73, 0.4)',
  }
}

function DistanceBadge({distance}: {distance: number}) {
  const band = distanceBand(distance)
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold"
      style={{
        background: band.bg,
        color: band.color,
        borderColor: band.border,
      }}
      title={`Cosine distance to source: ${distance.toFixed(6)}`}
    >
      d = {distance.toFixed(4)}
    </span>
  )
}

interface RowProps {
  label: ReactNode
  children: ReactNode
  differs?: boolean
}

function Row({label, children, differs}: RowProps) {
  return (
    <>
      <dt className="py-1 pr-3 text-sm" style={{color: 'var(--text-faint)'}}>
        {label}
      </dt>
      <dd
        className="py-1 pl-2 text-sm"
        style={{
          color: differs ? 'var(--diff-fg)' : 'var(--text)',
          borderLeft: differs
            ? '2px solid var(--diff-fg)'
            : '2px solid transparent',
          background: differs ? 'var(--diff-bg)' : 'transparent',
        }}
      >
        {children}
      </dd>
    </>
  )
}

export function DuplicateAssetCard({
  id,
  originalPath,
  asset,
  error,
  hasEmbedding,
  distance,
  reference,
  label,
}: Props) {
  const [marked, setMarked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const cardStyle = {
    background: 'var(--surface)',
    borderColor: marked ? 'var(--danger)' : 'var(--border)',
    borderWidth: marked ? '2px' : '1px',
  }

  if (!asset) {
    return (
      <div
        className="flex w-[360px] shrink-0 snap-start flex-col rounded-lg border p-4"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--danger)',
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text-muted)',
            }}
          >
            {label}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-(--danger)">
            Asset unavailable
          </span>
        </div>
        {hasEmbedding != null || distance != null ? (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {hasEmbedding != null ? (
              <EmbeddingBadge present={hasEmbedding} />
            ) : null}
            {distance != null ? <DistanceBadge distance={distance} /> : null}
          </div>
        ) : null}

        <p className="kicker mb-1" style={{color: 'var(--text-faint)'}}>
          Asset ID
        </p>
        <CopyText
          value={id}
          title="Click to copy asset ID"
          className="break-all font-mono text-xs"
        />

        {originalPath ? (
          <>
            <p className="kicker mb-1" style={{color: 'var(--text-faint)'}}>
              Path
            </p>
            <CopyText
              value={originalPath}
              title="Click to copy path"
              className="break-all font-mono text-xs"
            />
          </>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm" style={{color: 'var(--danger)'}}>
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  const exif = asset.exifInfo

  const refExif = reference?.exifInfo

  const taken = exif?.dateTimeOriginal ?? asset.localDateTime
  const refTaken = reference
    ? (refExif?.dateTimeOriginal ?? reference.localDateTime)
    : undefined

  const dimensions = formatDimensions(
    exif?.exifImageWidth,
    exif?.exifImageHeight,
  )
  const refDimensions = reference
    ? formatDimensions(refExif?.exifImageWidth, refExif?.exifImageHeight)
    : undefined

  const camera = formatCamera(exif?.make, exif?.model)
  const refCamera = reference
    ? formatCamera(refExif?.make, refExif?.model)
    : undefined

  const location = formatLocation(
    exif?.latitude,
    exif?.longitude,
    exif?.city,
    exif?.country,
  )
  const refLocation = reference
    ? formatLocation(
        refExif?.latitude,
        refExif?.longitude,
        refExif?.city,
        refExif?.country,
      )
    : undefined

  const hasRef = !!reference
  const diff = (a: unknown, b: unknown) => hasRef && a !== b

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
      className="flex w-[360px] shrink-0 snap-start flex-col rounded-lg border transition"
      style={cardStyle}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{background: 'var(--surface-2)', color: 'var(--text-muted)'}}
        >
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          {distance != null ? <DistanceBadge distance={distance} /> : null}
          {hasEmbedding != null ? (
            <EmbeddingBadge present={hasEmbedding} />
          ) : null}
        </div>
      </div>

      <a
        href={`/api/thumbnail/${asset.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="relative mx-4 mt-3 block overflow-hidden rounded-md"
        style={{background: 'var(--surface-2)'}}
        title="Open full thumbnail in new tab"
      >
        <img
          src={`/api/thumbnail/${asset.id}`}
          alt={asset.originalFileName}
          className="h-64 w-full object-cover transition"
          loading="lazy"
          style={{opacity: marked ? 0.45 : 1}}
        />
        {marked ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{background: 'rgba(248, 81, 73, 0.15)'}}
          >
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
              style={{background: 'var(--danger)', color: '#fff'}}
            >
              Marked for deletion
            </span>
          </div>
        ) : null}
      </a>

      <h3
        className="mt-3 px-4 text-sm font-semibold"
        style={{color: 'var(--text)'}}
        title={asset.originalFileName}
      >
        <span
          className="block truncate"
          style={{
            color: diff(asset.originalFileName, reference?.originalFileName)
              ? 'var(--diff-fg)'
              : 'var(--text)',
          }}
        >
          {asset.originalFileName}
        </span>
      </h3>

      <dl
        className="mt-3 grid grid-cols-[max-content_1fr] gap-y-0.5 px-4"
        style={{color: 'var(--text)'}}
      >
        <Row
          label="Size"
          differs={diff(exif?.fileSizeInByte, refExif?.fileSizeInByte)}
        >
          {formatBytes(exif?.fileSizeInByte)}
        </Row>

        <Row label="Dimensions" differs={diff(dimensions, refDimensions)}>
          {dimensions}
        </Row>

        <Row
          label="Taken date"
          differs={diff(formatDatePart(taken), formatDatePart(refTaken))}
        >
          {formatDatePart(taken)}
        </Row>
        <Row
          label="Taken time"
          differs={diff(formatTimePart(taken), formatTimePart(refTaken))}
        >
          {formatTimePart(taken)}
        </Row>

        <Row
          label={
            <span className="flex items-center gap-1.5">
              <Camera size={13} /> Camera
            </span>
          }
          differs={diff(camera, refCamera)}
        >
          {camera}
        </Row>

        <Row
          label={
            <span className="flex items-center gap-1.5">
              <MapPin size={13} /> Location
            </span>
          }
          differs={diff(location, refLocation)}
        >
          <span className="break-words">{location}</span>
        </Row>
      </dl>

      <div className="mt-2 space-y-2 p-4">
        <div>
          <p className="kicker mb-1">Asset ID</p>
          <CopyText
            value={id}
            title="Click to copy asset ID"
            className="break-all rounded-md p-2 font-mono text-xs"
          />
        </div>
        <div>
          <p className="kicker mb-1">Path</p>
          <CopyText
            value={asset.originalPath}
            title="Click to copy path"
            className="break-all rounded-md p-2 font-mono text-xs"
          />
        </div>
      </div>

      <div className="mt-4 px-4 pb-4">
        <button
          type="button"
          onClick={handleMark}
          disabled={submitting || marked}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition',
          )}
          style={{
            background: marked ? 'var(--surface-2)' : 'var(--danger)',
            color: marked ? 'var(--text-faint)' : '#fff',
            cursor: marked || submitting ? 'not-allowed' : 'pointer',
            textDecoration: marked ? 'line-through' : 'none',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          <Trash2 size={14} />
          {marked
            ? 'Marked for deletion'
            : submitting
              ? 'Marking…'
              : 'Mark for deletion'}
        </button>

        {submitError ? (
          <p className="mt-2 text-sm" style={{color: 'var(--danger)'}}>
            {submitError}
          </p>
        ) : null}
      </div>
    </div>
  )
}
