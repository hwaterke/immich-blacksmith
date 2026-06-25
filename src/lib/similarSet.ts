import type {ComparisonAsset} from './assetComparison'
import type {AssetResult, SimilarResult} from './duplicateLoader'

export interface MissingAsset {
  id: string
  originalPath?: string
  error?: string
}

export interface SimilarSet {
  /** Comparable assets, reference (source) first. Empty when there's nothing to compare. */
  assets: ComparisonAsset[]
  /** assetId → distance to the source. */
  distances: Record<string, number>
  /** Assets that could not be loaded. */
  missing: MissingAsset[]
}

/** Shape a source asset + its similar matches into the columns/distances the
 *  comparison table consumes. Used by the similar and nikon-low-res pages. */
export function buildSimilarSet(
  source: AssetResult,
  similars: SimilarResult[],
): SimilarSet {
  const distances: Record<string, number> = {}
  const missing: MissingAsset[] = []
  const matched: ComparisonAsset[] = []

  for (const s of similars) {
    if (s.asset) {
      matched.push(s.asset)
      distances[s.id] = s.distance
    } else {
      missing.push({id: s.id, originalPath: s.originalPath, error: s.error})
    }
  }

  // Only build the comparison when there is something to compare against.
  const assets =
    matched.length > 0 && source.asset ? [source.asset, ...matched] : []

  if (matched.length > 0 && !source.asset) {
    missing.push({
      id: source.id,
      originalPath: source.originalPath,
      error: source.error ?? 'Source asset unavailable',
    })
  }

  return {assets, distances, missing}
}
