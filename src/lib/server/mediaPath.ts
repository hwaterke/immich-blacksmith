import '@tanstack/react-start/server-only'
import {resolve} from 'node:path'

/**
 * Immich stores each asset's path as seen inside the Immich container
 * (`asset.originalPath`). The same media may be mounted at a different location
 * inside the Blacksmith container, so we translate the stored path: strip the
 * Immich-side prefix (`MEDIA_PATH_SOURCE`, if set), then prepend the
 * Blacksmith-side prefix (`MEDIA_PATH_TARGET`).
 *
 * Configured via env:
 *   MEDIA_PATH_SOURCE — prefix as stored by Immich (e.g. /usr/src/app/upload).
 *                       Leave blank to keep the whole path.
 *   MEDIA_PATH_TARGET — prefix where that data is mounted in Blacksmith.
 *
 * Examples:
 *   SOURCE="",       TARGET="/Volumes" → /photos-archive/a.jpg → /Volumes/photos-archive/a.jpg
 *   SOURCE="/upload", TARGET="/media"  → /upload/lib/a.jpg     → /media/lib/a.jpg
 *   SOURCE="",       TARGET=""         → unchanged (mounted at the identical path)
 */
function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function hasPathPrefix(p: string, prefix: string): boolean {
  return p === prefix || p.startsWith(prefix + '/')
}

export function toContainerPath(originalPath: string): string {
  const source = stripTrailingSlash(process.env.MEDIA_PATH_SOURCE ?? '')
  const target = stripTrailingSlash(process.env.MEDIA_PATH_TARGET ?? '')

  // A SOURCE that doesn't actually prefix this path can't be mapped — leave it.
  if (source && !hasPathPrefix(originalPath, source)) return originalPath

  const remainder = source ? originalPath.slice(source.length) : originalPath
  return target + remainder
}

/**
 * Guards against path traversal: when a target mount root is configured, the
 * resolved path must stay within it. With no target configured we cannot
 * meaningfully constrain it, so any path is allowed.
 */
export function isUnderMediaRoot(resolvedPath: string): boolean {
  const target = stripTrailingSlash(process.env.MEDIA_PATH_TARGET ?? '')
  if (!target) return true

  const root = resolve(target)
  const candidate = resolve(resolvedPath)
  return candidate === root || candidate.startsWith(root + '/')
}

/*
 * Immich's GENERATED derivatives (thumbnail/preview/encoded-video, in
 * `asset_file.path`) live under Immich's own upload dir — a different root than
 * the originals above. Originals may be an external library (e.g. /photos-archive),
 * while derivatives are always under the upload location (Immich stores them as
 * /usr/src/app/upload/...). Translate those paths with a dedicated mapping that
 * mirrors `toContainerPath`/`MEDIA_PATH_*`:
 *   IMMICH_UPLOAD_PATH_SOURCE — Immich-side prefix to strip (e.g. /usr/src/app/upload).
 *   IMMICH_UPLOAD_PATH_TARGET — where that dir is mounted in Blacksmith.
 * Leave both blank when the upload dir is mounted at the identical path.
 */
export function toUploadContainerPath(immichPath: string): string {
  const source = stripTrailingSlash(process.env.IMMICH_UPLOAD_PATH_SOURCE ?? '')
  const target = stripTrailingSlash(process.env.IMMICH_UPLOAD_PATH_TARGET ?? '')

  if (source && !hasPathPrefix(immichPath, source)) return immichPath

  const remainder = source ? immichPath.slice(source.length) : immichPath
  return target + remainder
}

export function isUnderUploadRoot(resolvedPath: string): boolean {
  const target = stripTrailingSlash(process.env.IMMICH_UPLOAD_PATH_TARGET ?? '')
  if (!target) return true

  const root = resolve(target)
  const candidate = resolve(resolvedPath)
  return candidate === root || candidate.startsWith(root + '/')
}
