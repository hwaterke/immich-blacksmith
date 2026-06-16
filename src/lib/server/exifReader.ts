import '@tanstack/react-start/server-only'
import {resolve} from 'node:path'
import {findOriginalPathByAssetId} from './assetQueries'
import {toContainerPath, isUnderMediaRoot} from './mediaPath'
import {readExif} from './exif'
import type {ExifTags} from './exif'

export type ExifResult = {tags: ExifTags} | {error: string}

export async function readExifForAsset(assetId: string): Promise<ExifResult> {
  const originalPath = await findOriginalPathByAssetId(assetId)
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
}
