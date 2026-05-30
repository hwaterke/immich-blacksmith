import {useState} from 'react'
import type {MouseEvent} from 'react'
import {Check, Copy} from 'lucide-react'
import {cn} from '../../lib/utils'

interface Props {
  value: string
  title?: string
  className?: string
}

/** Click-to-copy chip (.copy) — shows a transient ✓ after copying. */
export function CopyChip({value, title, className}: Props) {
  const [done, setDone] = useState(false)

  async function handleCopy(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /* clipboard unavailable — still show feedback */
    }
    setDone(true)
    setTimeout(() => setDone(false), 1200)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={title ?? value}
      className={cn('copy', done && 'done', className)}
    >
      <span className="txt">{value}</span>
      <span className="ico">
        {done ? <Check size={13} /> : <Copy size={13} />}
      </span>
    </button>
  )
}
