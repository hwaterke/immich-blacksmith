import {createServerFn} from '@tanstack/react-start'
import type {AssetResponseDto} from '@immich/sdk'

export interface AssetResult {
  id: string
  asset?: AssetResponseDto
  error?: string
}

export interface SimilarResult extends AssetResult {
  distance: number
}

export interface DuplicatesData {
  source: AssetResult
  sourceHasEmbedding: boolean
  similars: SimilarResult[]
}

export const getNikonLowResList = createServerFn({method: 'GET'}).handler(
  async () => {
    const {getNikonLowResAssets} = await import('./assetQueries')
    return getNikonLowResAssets()
  },
)

export const loadDuplicatesFor = createServerFn({method: 'GET'})
  .inputValidator((data: {assetId: string; maxDistance: number}) => data)
  .handler(async ({data}): Promise<DuplicatesData> => {
    const {findSimilarAssetIds} = await import('./assetQueries')
    const {ensureImmichInit} = await import('./immich')
    const {getAssetInfo} = await import('@immich/sdk')

    const {sourceHasEmbedding, results: similars} = await findSimilarAssetIds(
      data.assetId,
      data.maxDistance,
    )

    ensureImmichInit()
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

    const [source, ...similarAssets] = await Promise.all([
      loadAsset(data.assetId),
      ...similars.map((s) => loadAsset(s.assetId)),
    ])

    const similarResults: SimilarResult[] = similars.map((s, i) => ({
      ...similarAssets[i],
      distance: s.distance,
    }))

    return {source, sourceHasEmbedding, similars: similarResults}
  })
