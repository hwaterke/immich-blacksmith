import {createServerFn} from '@tanstack/react-start'
import {
  getAssetDuplicates,
  getAssetInfo,
  type AssetResponseDto,
} from '@immich/sdk'
import {looksLikeAssetId} from './utils'
import {
  assetDistance,
  distancesFromReference,
  findAssetIdByOriginalPath,
  findSimilarAssetIds,
  getComparisonAssetsByIds,
  getNikonLowResAssets,
} from './server/assetQueries'
import {ensureImmichInit, getImmichWebUrl} from './server/immich'
import type {ComparisonAsset} from './assetComparison'

export interface AssetResult {
  id: string
  originalPath?: string
  asset?: ComparisonAsset
  error?: string
}

export interface SimilarResult extends AssetResult {
  distance: number
}

export interface DuplicatesData {
  source: AssetResult
  sourceHasEmbedding: boolean
  similars: SimilarResult[]
  immichWebUrl: string
}

export interface ComparisonData {
  a: AssetResult
  b: AssetResult
  distance: number | null
  immichWebUrl: string
}

export interface DuplicateGroup {
  duplicateId: string
  assets: AssetResponseDto[]
  suggestedKeepAssetIds: string[]
}

export type DuplicateGroupResult =
  | {kind: 'empty'}
  | {
      kind: 'loaded'
      total: number
      index: number
      group: DuplicateGroup
      /** assetId → vector distance to the group's reference (assets[0]). */
      referenceDistances: Record<string, number>
      immichWebUrl: string
    }

export const getNikonLowResList = createServerFn({method: 'GET'}).handler(() =>
  getNikonLowResAssets(),
)

export const resolveOriginalPath = createServerFn({method: 'GET'})
  .inputValidator((data: {originalPath: string}) => data)
  .handler(({data}) => findAssetIdByOriginalPath(data.originalPath))

export async function resolveInputToAssetId(
  raw: string,
): Promise<{assetId: string} | {error: string}> {
  const trimmed = raw.trim()
  if (!trimmed) return {error: 'Required'}
  if (looksLikeAssetId(trimmed)) return {assetId: trimmed}

  const result = await resolveOriginalPath({data: {originalPath: trimmed}})
  if ('assetId' in result) return {assetId: result.assetId}
  if (result.error === 'not_found')
    return {error: 'No asset found for that path'}
  return {error: 'Path matches multiple assets — be more specific'}
}

export const loadDuplicatesFor = createServerFn({method: 'GET'})
  .inputValidator((data: {assetId: string; maxDistance: number}) => data)
  .handler(async ({data}): Promise<DuplicatesData> => {
    const {sourceHasEmbedding, results: similars} = await findSimilarAssetIds(
      data.assetId,
      data.maxDistance,
    )

    // Metadata comes from the DB (not the Immich API), so the review works for
    // assets owned by any user — the single API key only sees its own. One
    // query covers the source plus every match.
    const metadata = await getComparisonAssetsByIds([
      data.assetId,
      ...similars.map((s) => s.assetId),
    ])
    const immichWebUrl = getImmichWebUrl()

    const toResult = (id: string, originalPath?: string): AssetResult => {
      const asset = metadata.get(id)
      return asset
        ? {id, originalPath: asset.originalPath, asset}
        : {id, originalPath, error: 'Asset not found in database'}
    }

    const source = toResult(data.assetId)
    const similarResults: SimilarResult[] = similars.map((s) => ({
      ...toResult(s.assetId, s.originalPath),
      distance: s.distance,
    }))

    return {
      source,
      sourceHasEmbedding,
      similars: similarResults,
      immichWebUrl,
    }
  })

export const loadDuplicateGroup = createServerFn({method: 'GET'})
  .inputValidator((data: {index: number}) => data)
  .handler(async ({data}): Promise<DuplicateGroupResult> => {
    ensureImmichInit()
    const groups = await getAssetDuplicates()
    if (groups.length === 0) {
      return {kind: 'empty'}
    }

    const index = Math.min(Math.max(data.index, 0), groups.length - 1)
    const group = groups[index]

    const [reference, ...rest] = group.assets
    const referenceDistances =
      group.assets.length > 0
        ? await distancesFromReference(
            reference.id,
            rest.map((a) => a.id),
          )
        : {}

    return {
      kind: 'loaded',
      total: groups.length,
      index,
      group: {
        duplicateId: group.duplicateId,
        assets: group.assets,
        suggestedKeepAssetIds: group.suggestedKeepAssetIds,
      },
      referenceDistances,
      immichWebUrl: getImmichWebUrl(),
    }
  })

export const loadComparison = createServerFn({method: 'GET'})
  .inputValidator((data: {id1: string; id2: string}) => data)
  .handler(async ({data}): Promise<ComparisonData> => {
    ensureImmichInit()
    const immichWebUrl = getImmichWebUrl()
    const loadAsset = async (id: string): Promise<AssetResult> => {
      try {
        const asset = await getAssetInfo({id})
        return {id, asset}
      } catch (err) {
        return {
          id,
          error: err instanceof Error ? err.message : 'Failed to load asset',
        }
      }
    }

    const [a, b, distance] = await Promise.all([
      loadAsset(data.id1),
      loadAsset(data.id2),
      assetDistance(data.id1, data.id2),
    ])

    return {a, b, distance, immichWebUrl}
  })
