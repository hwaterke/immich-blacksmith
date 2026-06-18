import '@tanstack/react-start/server-only'
import {resolve} from 'node:path'
import {stat} from 'node:fs/promises'
import {findOriginalPathByAssetId} from './assetQueries'
import {toContainerPath, isUnderMediaRoot} from './mediaPath'
import {readExif} from './exif'
import type {ExifTags} from './exif'
import {createLogger, errorContext} from './logger'

const log = createLogger('exif')

export type ExifResult = {tags: ExifTags} | {error: string}

export async function readExifForAsset(assetId: string): Promise<ExifResult> {
  log.debug('Reading EXIF for asset', {assetId})

  const originalPath = await findOriginalPathByAssetId(assetId)
  if (!originalPath) {
    log.warn('Asset not found', {assetId})
    return {error: 'Asset not found'}
  }

  const containerPath = resolve(toContainerPath(originalPath))
  if (!isUnderMediaRoot(containerPath)) {
    log.warn('Resolved path outside media root', {assetId, containerPath})
    return {error: 'Resolved path is outside the configured media root'}
  }

  try {
    await stat(containerPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      log.warn('File not found on disk', {assetId, containerPath})
      return {error: 'File not found on disk'}
    }
    log.error('Failed to access file', {
      assetId,
      containerPath,
      ...errorContext(err),
    })
    return {error: err instanceof Error ? err.message : 'Failed to access file'}
  }

  try {
    const tags = await readExif(containerPath)
    log.debug('Read EXIF tags', {assetId, tagCount: Object.keys(tags).length})
    return {tags}
  } catch (err) {
    log.error('Failed to read EXIF', {
      assetId,
      containerPath,
      ...errorContext(err),
    })
    return {error: err instanceof Error ? err.message : 'Failed to read EXIF'}
  }
}
