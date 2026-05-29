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
