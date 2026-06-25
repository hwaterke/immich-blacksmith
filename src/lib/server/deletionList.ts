import {appendFile, mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'

/**
 * Single source of truth for the "assets to delete" log: a newline-separated
 * file of original asset paths queued for deletion. Centralizes the path and the
 * append/read/clear operations so routes don't duplicate the FS logic.
 */
const DELETION_LOG_PATH = './data/assets-to-delete.txt'

/** Appends an original asset path to the deletion log, creating it if needed. */
export async function addToDeletionList(originalPath: string): Promise<void> {
  await mkdir(dirname(DELETION_LOG_PATH), {recursive: true})
  await appendFile(DELETION_LOG_PATH, originalPath + '\n')
}

/**
 * Reads the deletion log as a list of paths, trimming blank lines. Returns an
 * empty array when the file has never been created.
 */
export async function readDeletionList(): Promise<string[]> {
  let contents: string
  try {
    contents = await readFile(DELETION_LOG_PATH, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  return contents
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * Clears the deletion log and returns how many entries were removed. Resets the
 * file to empty rather than deleting it; a no-op (returns 0) when absent.
 */
export async function clearDeletionList(): Promise<number> {
  const removed = (await readDeletionList()).length
  if (removed > 0) {
    await mkdir(dirname(DELETION_LOG_PATH), {recursive: true})
    await writeFile(DELETION_LOG_PATH, '')
  }
  return removed
}
