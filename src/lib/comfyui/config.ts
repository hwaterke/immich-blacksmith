import '@tanstack/react-start/server-only'

export type ComfyUIConfig = {
  baseUrl: string
  workflowsDir: string
  albumName: string
  /** Max time a prompt may take *while actually executing* in ComfyUI. The
   * clock starts when ComfyUI reports `execution_start`, not at submission, so
   * jobs waiting in ComfyUI's queue are never timed out by it. */
  timeoutMs: number
  /** Interval for the reconciliation poller that backstops missed ws messages. */
  pollIntervalMs: number
  /** Most recent finished jobs to keep in memory for the list endpoint. */
  jobsMax: number
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Reads ComfyUI-related configuration from the environment. COMFYUI_URL and
 * COMFYUI_WORKFLOWS_DIR are required (no workflows ship with the app, so the
 * directory must be supplied); the rest have sensible defaults. Throws when a
 * required variable is missing so failures surface clearly at request time
 * rather than as a confusing fetch/filesystem error later.
 */
export function getComfyUIConfig(): ComfyUIConfig {
  const baseUrl = process.env.COMFYUI_URL
  if (!baseUrl) {
    throw new Error('COMFYUI_URL environment variable is not set')
  }

  const workflowsDir = process.env.COMFYUI_WORKFLOWS_DIR
  if (!workflowsDir) {
    throw new Error('COMFYUI_WORKFLOWS_DIR environment variable is not set')
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    workflowsDir,
    albumName: process.env.COMFYUI_ALBUM_NAME ?? 'AI Generated',
    timeoutMs: intFromEnv('COMFYUI_TIMEOUT_MS', 600_000),
    pollIntervalMs: intFromEnv('COMFYUI_POLL_INTERVAL_MS', 2_500),
    jobsMax: intFromEnv('COMFYUI_JOBS_MAX', 200),
  }
}
