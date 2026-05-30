import {useCallback, useRef, useState} from 'react'

export interface FlagTarget {
  assetId: string
  originalPath: string
}

/** Tracks which assets are flagged for deletion and appends each one's
 *  originalPath to the server-side deletion log (POST /api/mark-for-deletion).
 *  No undo yet — once flagged, an asset stays flagged for the session and is
 *  posted exactly once. */
export function useFlagForDeletion() {
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set())
  const postedRef = useRef<Set<string>>(new Set())

  const flag = useCallback((target: FlagTarget) => {
    if (postedRef.current.has(target.assetId)) return
    postedRef.current.add(target.assetId)
    setFlaggedIds((prev) => new Set(prev).add(target.assetId))
    fetch('/api/mark-for-deletion', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({originalPath: target.originalPath}),
    }).catch(() => {
      // optimistic — the flag stays; the log write can be retried later
    })
  }, [])

  return {flaggedIds, flag}
}
