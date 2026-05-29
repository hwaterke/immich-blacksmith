import {createServerFn} from '@tanstack/react-start'
import {resolve} from 'node:path'
import type {ExifTags} from './exif'

export type ExifResult = {tags: ExifTags} | {error: string}

export const loadExif = createServerFn({method: 'GET'})
  .inputValidator((data: {assetId: string}) => data)
  .handler(async ({data}): Promise<ExifResult> => {
    const {findOriginalPathByAssetId} = await import('./assetQueries')
    const {toContainerPath, isUnderMediaRoot} = await import('./mediaPath')
    const {readExif} = await import('./exif')

    const originalPath = await findOriginalPathByAssetId(data.assetId)
    if (!originalPath) return {error: 'Asset not found'}

    const containerPath = resolve(toContainerPath(originalPath))
    if (!isUnderMediaRoot(containerPath)) {
      return {error: 'Resolved path is outside the configured media root'}
    }

    try {
      const tags = await readExif(containerPath)
      return {tags}
    } catch (err) {
      return {error: err instanceof Error ? err.message : 'Failed to read EXIF'}
    }
  })
