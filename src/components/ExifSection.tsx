import {useQuery} from '@tanstack/react-query'
import {useState} from 'react'
import {ChevronDown, ChevronRight} from 'lucide-react'
import {loadExif} from '../lib/exifLoader'

function formatExifValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function ExifSection({
  id,
  defaultOpen,
}: {
  id: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)

  const {data, isLoading, isError, error} = useQuery({
    queryKey: ['exif', id],
    queryFn: () => loadExif({data: {assetId: id}}),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const tags = data && 'tags' in data ? data.tags : undefined
  const serverError = data && 'error' in data ? data.error : undefined

  return (
    <div className="border-t px-4 py-3" style={{borderColor: 'var(--border)'}}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left text-sm font-semibold transition hover:brightness-110"
        style={{color: 'var(--text)'}}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        EXIF (exiftool)
      </button>

      {open ? (
        <div className="mt-2">
          {isLoading ? (
            <p className="text-sm" style={{color: 'var(--text-faint)'}}>
              Reading metadata…
            </p>
          ) : isError ? (
            <p className="text-sm" style={{color: 'var(--danger)'}}>
              {error instanceof Error ? error.message : 'Failed to load EXIF'}
            </p>
          ) : serverError ? (
            <p className="text-sm" style={{color: 'var(--danger)'}}>
              {serverError}
            </p>
          ) : tags ? (
            <div className="max-h-96 overflow-y-auto">
              {Object.entries(tags).map(([key, value]) => (
                <div key={key} className="flex gap-2 py-0.5 text-xs leading-snug">
                  <span
                    className="w-40 shrink-0 truncate font-mono font-semibold"
                    style={{color: 'var(--text-faint)'}}
                    title={key}
                  >
                    {key}
                  </span>
                  <span
                    className="min-w-0 break-words font-mono"
                    style={{color: 'var(--text)'}}
                  >
                    {formatExifValue(value)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
