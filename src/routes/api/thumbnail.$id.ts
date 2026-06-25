import {createFileRoute} from '@tanstack/react-router'
import {AssetMediaSize, viewAsset} from '@immich/sdk'
import {resolve} from 'node:path'
import {readFile} from 'node:fs/promises'
import {ensureImmichInit} from '../../lib/server/immich'
import {findThumbnailPathByAssetId} from '../../lib/server/assetQueries'
import {
  isUnderUploadRoot,
  toUploadContainerPath,
} from '../../lib/server/mediaPath'
import {
  createLogger,
  errorContext,
  withRequestLogging,
} from '../../lib/server/logger'

const log = createLogger('api:thumbnail')

/**
 * Serve Immich's pre-generated thumbnail file straight from disk. Used when the
 * API key can't serve the asset (it belongs to another Immich user). Returns
 * null when there's no thumbnail row or the file isn't readable, so the caller
 * can fall through to a 404.
 */
async function thumbnailFromDisk(assetId: string): Promise<Response | null> {
  const storedPath = await findThumbnailPathByAssetId(assetId)
  if (!storedPath) return null

  const containerPath = resolve(toUploadContainerPath(storedPath))
  if (!isUnderUploadRoot(containerPath)) {
    log.warn('Resolved thumbnail path outside upload root', {
      assetId,
      containerPath,
    })
    return null
  }

  try {
    const bytes = await readFile(containerPath)
    return new Response(bytes, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    log.warn('Thumbnail not readable on disk', {
      assetId,
      containerPath,
      ...errorContext(err),
    })
    return null
  }
}

export const Route = createFileRoute('/api/thumbnail/$id')({
  server: {
    handlers: {
      GET: withRequestLogging('api:thumbnail', async ({params}) => {
        ensureImmichInit()
        try {
          const blob = await viewAsset({
            id: params.id,
            size: AssetMediaSize.Thumbnail,
          })
          return new Response(blob, {
            headers: {
              'Content-Type': blob.type || 'image/jpeg',
              'Cache-Control': 'private, max-age=3600',
            },
          })
        } catch (err) {
          // The single API key only sees its own user's assets. For everyone
          // else, fall back to Immich's generated thumbnail file on disk.
          const fromDisk = await thumbnailFromDisk(params.id)
          if (fromDisk) return fromDisk

          log.warn('Thumbnail not found', {
            assetId: params.id,
            ...errorContext(err),
          })
          return new Response('Thumbnail not found', {status: 404})
        }
      }),
    },
  },
})
