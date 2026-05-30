import {Link} from '@tanstack/react-router'
import {Images, Trash2} from 'lucide-react'
import {cn} from '../../lib/utils'

interface Props {
  assetId: string
  /** Flagged for deletion. */
  flagged: boolean
  /** Reference column — shows a passive "Currently viewing" marker instead of "See similar". */
  isReference: boolean
  onDelete: () => void
}

/** Per-column actions: flag-for-deletion + see-similar.
 *  Presentational only — emits onDelete and links to the similar view.
 *  Built so a future "undo" affordance can replace the flagged label. */
export function PhotoActions({assetId, flagged, isReference, onDelete}: Props) {
  return (
    <div className="pa">
      <button
        type="button"
        className={cn('pa-btn pa-del', flagged && 'on')}
        onClick={onDelete}
      >
        <Trash2 size={14} />
        {flagged ? 'Will delete' : 'Delete'}
      </button>

      {isReference ? (
        <div className="pa-btn pa-ref">Currently viewing</div>
      ) : (
        <Link
          to="/review/similar/$id"
          params={{id: assetId}}
          className="pa-btn pa-sim no-underline"
        >
          <Images size={14} />
          See similar
        </Link>
      )}
    </div>
  )
}
