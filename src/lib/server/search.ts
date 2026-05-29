import { SearchParams } from "../shared/searchTypes";

export function searchAssets(params: SearchParams) {
    const { filters, with, sort, pagination } = params

    const assets = await db.selectFrom('asset').selectAll().where('asset.id', 'in', filters.assetIds).execute()
}
