import '@tanstack/react-start/server-only'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {[key: string]: JsonValue}

export type ExifTags = Record<string, JsonValue>

// Metadata dumps can be large (embedded thumbnails, maker notes, XMP), so give
// stdout plenty of room.
const MAX_BUFFER = 32 * 1024 * 1024

/**
 * Runs `exiftool -json -G0:1` on the file and returns the full tag map.
 * Keys are group-qualified (e.g. `EXIF:IFD0:Make`). Returns the single object
 * exiftool emits for one file.
 */
export async function readExif(containerPath: string): Promise<ExifTags> {
  let stdout: string
  try {
    ;({stdout} = await execFileAsync(
      'exiftool',
      ['-json', '-G0:1', containerPath],
      {maxBuffer: MAX_BUFFER},
    ))
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {stderr?: string}
    if (e.code === 'ENOENT') {
      throw new Error(
        'exiftool is not installed or not on PATH on the server',
      )
    }
    const detail = e.stderr?.trim() || e.message
    throw new Error(`exiftool failed: ${detail}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error('Failed to parse exiftool output')
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('exiftool returned no metadata')
  }

  return parsed[0] as ExifTags
}
