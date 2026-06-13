import '@tanstack/react-start/server-only'
import {
  addAssetsToAlbum,
  AssetMediaSize,
  createAlbum,
  createStack,
  getAllAlbums,
  getAssetInfo,
  uploadAsset,
  viewAsset,
} from '@immich/sdk'
import {ensureImmichInit} from '../immich'

/**
 * Downloads an asset's image bytes for use as a ComfyUI input. Prefers the
 * server-converted Fullsize JPEG (handles HEIC/raw originals); falls back to
 * Preview, which always exists, if no fullsize file is available.
 */
export async function downloadAssetImage(
  assetId: string,
): Promise<{blob: Blob; filename: string}> {
  ensureImmichInit()
  const info = await getAssetInfo({id: assetId})

  let blob: Blob
  try {
    blob = await viewAsset({id: assetId, size: AssetMediaSize.Fullsize})
  } catch {
    blob = await viewAsset({id: assetId, size: AssetMediaSize.Preview})
  }

  return {blob, filename: info.originalFileName}
}

/** Uploads a generated image to Immich as a new asset; returns its id. */
export async function uploadGeneratedAsset({
  blob,
  filename,
  deviceAssetId,
}: {
  blob: Blob
  filename: string
  deviceAssetId: string
}): Promise<string> {
  ensureImmichInit()
  const now = new Date().toISOString()
  // Immich detects the file type from the multipart part's filename. The SDK
  // appends a bare Blob as "blob" (no extension), which Immich rejects, so wrap
  // it in a File carrying the real filename.
  const file = new File([blob], filename, {
    type: blob.type || 'image/png',
  })
  const result = await uploadAsset({
    assetMediaCreateDto: {
      assetData: file,
      deviceId: 'immich-blacksmith',
      deviceAssetId,
      fileCreatedAt: now,
      fileModifiedAt: now,
      filename,
    },
  })
  return result.id
}

/**
 * Stacks the generated asset with the original (original stays primary). When
 * the original is already the primary of a stack, Immich merges that stack into
 * the new one, so repeated edits accumulate into a single stack. Returns the
 * stack id.
 */
export async function stackWithOriginal(
  originalId: string,
  generatedId: string,
): Promise<string> {
  ensureImmichInit()
  const stack = await createStack({
    stackCreateDto: {assetIds: [originalId, generatedId]},
  })
  return stack.id
}

/**
 * Ensures the named album exists and contains the asset. Creates the album
 * (seeded with the asset) when absent, otherwise adds the asset to it.
 */
export async function addToAlbum(
  albumName: string,
  assetId: string,
): Promise<void> {
  ensureImmichInit()
  const albums = await getAllAlbums({})
  const existing = albums.find((album) => album.albumName === albumName)

  if (existing) {
    await addAssetsToAlbum({id: existing.id, bulkIdsDto: {ids: [assetId]}})
  } else {
    await createAlbum({createAlbumDto: {albumName, assetIds: [assetId]}})
  }
}
