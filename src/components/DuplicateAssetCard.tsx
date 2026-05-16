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
  asset?: AssetResponseDto
  error?: string
  hasEmbedding?: boolean
  distance?: number
  reference?: AssetResponseDto
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

function highlightCls(differs: boolean): string {
  return differs
    ? 'rounded bg-yellow-200/70 px-1 py-0.5 dark:bg-yellow-400/25'
    : ''
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
        'group flex w-full items-start gap-1 text-left transition',
        className,
      )}
    >
      <span className="min-w-0 flex-1 break-all">{value}</span>
      {copied ? (
        <Check size={11} className="mt-0.5 shrink-0 text-emerald-600" />
      ) : (
        <Copy
          size={11}
          className="mt-0.5 shrink-0 opacity-40 transition group-hover:opacity-100"
        />
      )}
    </button>
  )
}

function EmbeddingBadge({present}: {present: boolean}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        present
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
          : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
      )}
    >
      {present ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
      {present ? 'Embedding' : 'No embedding'}
    </span>
  )
}

function DistanceBadge({distance}: {distance: number}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 font-mono text-[10px] text-[var(--sea-ink)] dark:bg-white/10">
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
      <dt className="font-medium">{label}</dt>
      <dd>
        <span className={cn('inline-block', highlightCls(!!differs))}>
          {children}
        </span>
      </dd>
    </>
  )
}

export function DuplicateAssetCard({
  id,
  asset,
  error,
  hasEmbedding,
  distance,
  reference,
}: Props) {
  const [marked, setMarked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  if (!asset) {
    return (
      <div className="island-shell flex w-[320px] shrink-0 flex-col rounded-2xl border border-red-300/60 p-4">
        <p className="island-kicker mb-2 text-red-600">Asset unavailable</p>
        {hasEmbedding != null || distance != null ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {hasEmbedding != null ? (
              <EmbeddingBadge present={hasEmbedding} />
            ) : null}
            {distance != null ? <DistanceBadge distance={distance} /> : null}
          </div>
        ) : null}
        <CopyText
          value={id}
          title="Click to copy asset ID"
          className="break-all font-mono text-[10px] text-[var(--sea-ink-soft)]"
        />
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
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
        <span
          className={cn(
            'inline-block max-w-full truncate align-bottom',
            highlightCls(
              diff(asset.originalFileName, reference?.originalFileName),
            ),
          )}
        >
          {asset.originalFileName}
        </span>
      </h3>

      {hasEmbedding != null || distance != null ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {hasEmbedding != null ? (
            <EmbeddingBadge present={hasEmbedding} />
          ) : null}
          {distance != null ? <DistanceBadge distance={distance} /> : null}
        </div>
      ) : null}

      <div className="mt-2">
        <p className="island-kicker mb-0.5 text-[9px]">Asset ID</p>
        <CopyText
          value={id}
          title="Click to copy asset ID"
          className="break-all font-mono text-[10px] text-[var(--sea-ink-soft)]"
        />
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs text-[var(--sea-ink-soft)]">
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
          label="Uploaded date"
          differs={diff(
            formatDatePart(asset.fileCreatedAt),
            formatDatePart(reference?.fileCreatedAt),
          )}
        >
          {formatDatePart(asset.fileCreatedAt)}
        </Row>
        <Row
          label="Uploaded time"
          differs={diff(
            formatTimePart(asset.fileCreatedAt),
            formatTimePart(reference?.fileCreatedAt),
          )}
        >
          {formatTimePart(asset.fileCreatedAt)}
        </Row>

        <Row
          label="Modified date"
          differs={diff(
            formatDatePart(asset.fileModifiedAt),
            formatDatePart(reference?.fileModifiedAt),
          )}
        >
          {formatDatePart(asset.fileModifiedAt)}
        </Row>
        <Row
          label="Modified time"
          differs={diff(
            formatTimePart(asset.fileModifiedAt),
            formatTimePart(reference?.fileModifiedAt),
          )}
        >
          {formatTimePart(asset.fileModifiedAt)}
        </Row>

        <Row
          label={
            <span className="flex items-center gap-1">
              <Camera size={12} /> Camera
            </span>
          }
          differs={diff(camera, refCamera)}
        >
          {camera}
        </Row>

        <Row
          label={
            <span className="flex items-center gap-1">
              <MapPin size={12} /> Location
            </span>
          }
          differs={diff(location, refLocation)}
        >
          <span className="break-words">{location}</span>
        </Row>
      </dl>

      <div className="mt-3">
        <p className="island-kicker mb-0.5 text-[9px]">Path</p>
        <CopyText
          value={asset.originalPath}
          title="Click to copy path"
          className="break-all rounded-md bg-black/5 p-2 font-mono text-[10px] text-[var(--sea-ink-soft)]"
        />
      </div>

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
