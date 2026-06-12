import {db} from '#/db'
import type {SearchParams} from '../shared/searchTypes'

export function searchAssets(params: SearchParams) {
  const {filters, joins, sort, pagination} = params

  const assets = await db
    .selectFrom('asset')
    .selectAll()
    .where('asset.id', 'in', filters.assetIds)
    .execute()
}
