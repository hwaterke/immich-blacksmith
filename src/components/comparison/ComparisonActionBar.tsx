import {ArrowRight, SkipForward} from 'lucide-react'

interface Props {
  /** e.g. "Keeping 1 · deleting 4 · frees 32.2 MB". */
  summary?: string
  applyLabel?: string
  onApply: () => void
  onSkip?: () => void
  applyDisabled?: boolean
}

/** Bottom action bar for stepping through review groups.
 *  Presentational: counts/labels are props; emits onApply / onSkip. */
export function ComparisonActionBar({
  summary,
  applyLabel = 'Apply & next',
  onApply,
  onSkip,
  applyDisabled,
}: Props) {
  return (
    <div
      className="flex items-center gap-[12px] border-t px-[26px] py-[14px]"
      style={{background: 'var(--surface)', borderColor: 'var(--border)'}}
    >
      {onSkip ? (
        <button type="button" className="btn ghost" onClick={onSkip}>
          <SkipForward size={15} strokeWidth={1.75} /> Skip group
        </button>
      ) : null}

      {summary ? (
        <span className="text-[12.5px]" style={{color: 'var(--ink-2)'}}>
          {summary}
        </span>
      ) : null}

      <div className="flex-1" />

      <span
        className="flex items-center gap-[7px] text-[11.5px]"
        style={{color: 'var(--ink-4)'}}
      >
        <span className="kbd">←</span>
        <span className="kbd">→</span>
        navigate
        <span className="kbd">⏎</span>
        apply
      </span>

      <button
        type="button"
        className="btn primary"
        onClick={onApply}
        disabled={applyDisabled}
      >
        {applyLabel} <ArrowRight size={15} strokeWidth={1.75} />
      </button>
    </div>
  )
}
