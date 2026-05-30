import {Fragment, useMemo, useState} from 'react'
import {useQueries} from '@tanstack/react-query'
import {ChevronRight, Pin, Sparkles, Trash2} from 'lucide-react'
import {cn} from '../../lib/utils'
import {buildExifRows} from '../../lib/assetComparison'
import type {
  ComparisonCell,
  ComparisonColumn,
  ComparisonModel,
} from '../../lib/assetComparison'
import {loadExif} from '../../lib/exifLoader'
import {CopyChip} from './CopyChip'
import {PhotoActions} from './PhotoActions'

interface Props {
  model: ComparisonModel
  /** Asset IDs currently flagged for deletion. */
  flaggedIds: Set<string>
  onFlag: (column: ComparisonColumn) => void
  /** Label for the header row's first cell (e.g. "5 candidates"). */
  countLabel?: string
  countSub?: string
}

function Val({cell}: {cell: ComparisonCell}) {
  return (
    <div className={cn('val', cell.tone)}>
      {cell.value}
      {cell.sub ? <span className="sub">{cell.sub}</span> : null}
    </div>
  )
}

export function ComparisonTable({
  model,
  flaggedIds,
  onFlag,
  countLabel,
  countSub = 'most similar group',
}: Props) {
  const [exifOpen, setExifOpen] = useState(false)
  const {columns, specRows} = model
  const n = columns.length
  const gridTemplateColumns = `184px repeat(${n}, minmax(0,1fr))`
  const isLast = (i: number) => i === n - 1

  // EXIF rows come from running exiftool on each image, lazy-loaded (per asset,
  // sharing ExifSection's cache) when the section is expanded.
  const exifQueries = useQueries({
    queries: columns.map((col) => ({
      queryKey: ['exif', col.assetId],
      queryFn: () => loadExif({data: {assetId: col.assetId}}),
      enabled: exifOpen,
      staleTime: 5 * 60 * 1000,
    })),
  })
  const exifLoading = exifOpen && exifQueries.some((q) => q.isLoading)
  const tagMaps = exifQueries.map((q) =>
    q.data && 'tags' in q.data ? q.data.tags : undefined,
  )
  const exifSignature = exifQueries.map((q) => q.dataUpdatedAt).join(',')
  const exifRows = useMemo(() => buildExifRows(tagMaps), [exifSignature])

  return (
    <div className="cgrid mt-1 animate-rise" style={{gridTemplateColumns}}>
      {/* ── header row ── */}
      <div className="cg-cell cg-label cg-head z-[4] rounded-tl-[11px]">
        <span className="lk">
          {countLabel ?? `${n} candidates`}
          <small>{countSub}</small>
        </span>
      </div>
      {columns.map((col, i) => {
        const flagged = flaggedIds.has(col.assetId)
        const ring = (col.isRecommended || col.isReference) && !flagged
        return (
          <div
            key={col.assetId}
            className={cn(
              'cg-cell cg-head',
              isLast(i) && 'rounded-tr-[11px] border-r-0',
            )}
          >
            <div className="mb-[10px] flex h-[22px] items-center justify-between gap-2">
              <span className="font-mono text-[11px] tracking-[0.06em] text-ink-4">
                {col.isReference ? 'REF' : String(i + 1).padStart(2, '0')}
              </span>
              {flagged ? (
                <span className="badge del-flag whitespace-nowrap">
                  <Trash2 size={12} /> Will delete
                </span>
              ) : col.isReference ? (
                <span className="badge rec whitespace-nowrap">
                  <Pin size={12} /> Reference
                </span>
              ) : col.isRecommended ? (
                <span className="badge rec whitespace-nowrap">
                  <Sparkles size={12} /> Best quality
                </span>
              ) : null}
            </div>
            <a
              href={col.immichUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn('shot', ring && 'rec')}
              title="Open in Immich"
              style={{
                opacity: flagged ? 0.4 : 1,
                filter: flagged ? 'grayscale(0.5)' : 'none',
              }}
            >
              <img
                src={col.thumbnailUrl}
                alt={col.fileName}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </a>
            <div
              className={cn('fname', flagged && 'line-through opacity-60')}
              title={col.fileName}
            >
              {col.fileName}
            </div>
            <PhotoActions
              assetId={col.assetId}
              flagged={flagged}
              isReference={col.isReference}
              onDelete={() => onFlag(col)}
            />
          </div>
        )
      })}

      {/* ── distance to #1 ── */}
      <div className="cg-cell cg-label">
        <span className="lk">
          Distance to #1<small>vector similarity</small>
        </span>
      </div>
      {columns.map((col, i) => (
        <div
          key={col.assetId}
          className={cn('cg-cell', isLast(i) && 'border-r-0')}
        >
          {col.isReference ? (
            <span className="tagref whitespace-nowrap">◆ Reference</span>
          ) : col.distance == null ? (
            <div className="val text-ink-4">—</div>
          ) : (
            <div className="flex flex-col gap-[6px]">
              <div className="val">{col.distance.toFixed(3)}</div>
              <div className="dbar">
                <i style={{width: `${col.distanceBarPct}%`}} />
              </div>
            </div>
          )}
        </div>
      ))}

      {/* ── spec rows ── */}
      {specRows.map((row) => (
        <Row key={row.label} label={row.label}>
          {row.cells.map((cell, i) => (
            <div
              key={columns[i].assetId}
              className={cn(
                'cg-cell',
                cell.tone && `cg-hl-${cell.tone}`,
                isLast(i) && 'border-r-0',
              )}
            >
              <Val cell={cell} />
            </div>
          ))}
        </Row>
      ))}

      {/* ── asset id ── */}
      <Row label="Asset ID">
        {columns.map((col, i) => (
          <div
            key={col.assetId}
            className={cn('cg-cell', isLast(i) && 'border-r-0')}
          >
            <CopyChip
              value={col.assetId}
              title={`Copy asset ID — ${col.assetId}`}
            />
          </div>
        ))}
      </Row>

      {/* ── asset path ── */}
      <Row label="Asset path">
        {columns.map((col, i) => (
          <div
            key={col.assetId}
            className={cn('cg-cell', isLast(i) && 'border-r-0')}
          >
            <CopyChip
              value={col.originalPath}
              title={`Copy path — ${col.originalPath}`}
            />
          </div>
        ))}
      </Row>

      {/* ── EXIF section ── */}
      <button
        type="button"
        className={cn(
          'exif-toggle',
          exifOpen ? 'open' : 'rounded-b-[11px] border-b-0',
        )}
        onClick={() => setExifOpen((v) => !v)}
      >
        <span className="chev">
          <ChevronRight size={13} />
        </span>
        <span className="et-title">All EXIF</span>
        <span className="et-sub">
          {exifOpen
            ? exifRows.length > 0
              ? `hide ${exifRows.length} fields per image`
              : 'hide'
            : 'show all EXIF (exiftool)'}
        </span>
      </button>
      {exifOpen ? (
        exifLoading ? (
          <div className="cg-exif col-span-full border-b-0 rounded-b-[11px] text-ink-3">
            Reading metadata…
          </div>
        ) : exifRows.length === 0 ? (
          <div className="cg-exif col-span-full border-b-0 rounded-b-[11px] text-ink-4">
            No EXIF available
          </div>
        ) : (
          exifRows.map((row, ri) => {
            const lastRow = ri === exifRows.length - 1
            return (
              <Fragment key={row.label}>
                <div
                  className={cn(
                    'cg-exiflabel',
                    lastRow && 'rounded-bl-[11px] border-b-0',
                  )}
                >
                  <span className="lk text-[10.5px]">{row.label}</span>
                </div>
                {row.cells.map((cell, i) => (
                  <div
                    key={columns[i].assetId}
                    className={cn(
                      'cg-exif',
                      cell.tone && `cg-hl-${cell.tone}`,
                      isLast(i) && 'border-r-0',
                      lastRow && 'border-b-0',
                      lastRow && isLast(i) && 'rounded-br-[11px]',
                    )}
                  >
                    <div className={cn('ev', cell.value === '—' && 'empty')}>
                      {cell.value}
                    </div>
                  </div>
                ))}
              </Fragment>
            )
          })
        )
      ) : null}
    </div>
  )
}

/** A label cell + its row of value cells (label sticks to the left). */
function Row({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <>
      <div className="cg-cell cg-label">
        <span className="lk">{label}</span>
      </div>
      {children}
    </>
  )
}
