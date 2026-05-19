import {createFileRoute} from '@tanstack/react-router'
import type {MouseEvent} from 'react'

const data = []

export const Route = createFileRoute('/sanity-check')({
  component: SanityCheckPage,
})

interface CardProps {
  id: string
  originalPath: string
  dateTime: string
  width: number
  height: number
  distance?: number
}

function Card({
  id,
  originalPath,
  dateTime,
  width,
  height,
  distance,
}: CardProps) {
  return (
    <div className="border p-4 m-2 bg-(--surface) border-(--border) rounded-lg">
      <img
        src={`/api/thumbnail/${id}`}
        alt={originalPath}
        className="h-64 w-full object-contain transition"
        loading="lazy"
      />
      <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-y-0.5 px-4">
        <dt className="py-1 pr-3 text-sm text-(--text-faint)">Path</dt>
        <dd className="py-1 pl-2 text-xs font-mono">{originalPath}</dd>

        <dt className="py-1 pr-3 text-sm text-(--text-faint)">Date Time</dt>
        <dd className="py-1 pl-2 text-sm">{dateTime}</dd>
        <dt className="py-1 pr-3 text-sm text-(--text-faint)">Size</dt>
        <dd className="py-1 pl-2 text-sm">
          {width} × {height}
        </dd>
        {distance && (
          <>
            <dt className="py-1 pr-3 text-sm text-(--text-faint)">Distance</dt>
            <dd className="py-1 pl-2 text-sm">{distance}</dd>
          </>
        )}
      </dl>
    </div>
  )
}

async function handleCopy(e: MouseEvent<HTMLButtonElement>) {
  e.preventDefault()
  try {
    const value = data
      .map((item) => `rm '/Volumes${item.low_res_original_path}' || true`)
      .join('\n')

    await navigator.clipboard.writeText(value)
  } catch {
    /* ignore */
  }
}

function SanityCheckPage() {
  return (
    <div>
      <h1>Sanity Check</h1>

      <button type="button" onClick={handleCopy}>
        Print deletion list
      </button>

      {data.map((item) => (
        <div key={item.low_res_id} className="p-4 m-2">
          <div className="flex items-center gap-2">
            <Card
              id={item.low_res_id}
              originalPath={item.low_res_original_path}
              dateTime={item.low_res_date_time}
              width={item.low_res_width}
              height={item.low_res_height}
            />
            <Card
              id={item.original_id}
              originalPath={item.original_original_path}
              dateTime={item.original_date_time}
              width={item.original_width}
              height={item.original_height}
            />
          </div>
          <div>
            <div className="text-sm text-(--text-faint)">Distance</div>
            <div className="text-sm font-monot">{item.distance}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
