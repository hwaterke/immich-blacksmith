import '@tanstack/react-start/server-only'
import {randomUUID} from 'node:crypto'
import {extname} from 'node:path'
import {getComfyUIConfig} from './config'
import {
  downloadOutput,
  getHistoryImages,
  getQueueState,
  queuePrompt,
  uploadImage,
} from './client'
import {
  isAwaiting,
  notifyStarted,
  settleReject,
  settleResolve,
  waitForExecution,
} from './ws'
import {
  addToAlbum,
  downloadAssetImage,
  stackWithOriginal,
  uploadGeneratedAsset,
} from './immich'
import {prepareWorkflow} from './workflow'
import {createLogger, errorContext} from '../logger'

const log = createLogger('comfyui')

export type JobStatus =
  | 'pending'
  | 'downloading'
  | 'uploading-to-comfyui'
  | 'queued'
  | 'running'
  | 'saving'
  | 'completed'
  | 'failed'

export type JobRecord = {
  jobId: string
  status: JobStatus
  workflow: string
  assetId?: string
  promptId?: string
  /** 0–100 while a prompt is executing, from ComfyUI's progress events. */
  progress?: number
  createdAt: string
  updatedAt: string
  // Present when status === 'completed'
  result?: {newAssetId: string; stackId?: string; addedToAlbum: boolean}
  // Present when status === 'failed'
  error?: string
  failedStage?: JobStatus
}

/** Input handed to the background pipeline after the route validated everything. */
export type PipelineInput = {
  template: string
  workflow: string
  prompt: string
  assetId?: string
}

const FINISHED: ReadonlySet<JobStatus> = new Set<JobStatus>([
  'completed',
  'failed',
])

function isFinished(status: JobStatus): boolean {
  return FINISHED.has(status)
}

// --- Job store -------------------------------------------------------------
// In-memory for now, behind an interface so a SQLite/Postgres adapter can be
// dropped in later without touching call sites.

export type JobStore = {
  save: (job: JobRecord) => void
  get: (jobId: string) => JobRecord | undefined
  list: () => JobRecord[]
}

function createInMemoryStore(): JobStore {
  // Map preserves insertion order, so iteration is oldest-first.
  const jobs = new Map<string, JobRecord>()
  return {
    save(job) {
      const isNew = !jobs.has(job.jobId)
      jobs.set(job.jobId, job)
      if (isNew) enforceCap(jobs)
    },
    get: (jobId) => jobs.get(jobId),
    list: () => [...jobs.values()],
  }
}

// Keep memory bounded to the most recent jobs. Evict the oldest *finished*
// jobs; never drop one that is still in flight.
function enforceCap(jobs: Map<string, JobRecord>): void {
  const {jobsMax} = getComfyUIConfig()
  if (jobs.size <= jobsMax) return
  for (const [jobId, job] of jobs) {
    if (jobs.size <= jobsMax) break
    if (isFinished(job.status)) jobs.delete(jobId)
  }
}

const store: JobStore = createInMemoryStore()

export function getJob(jobId: string): JobRecord | undefined {
  return store.get(jobId)
}

export function listJobs(): JobRecord[] {
  return store.list()
}

function update(job: JobRecord, changes: Partial<JobRecord>): void {
  Object.assign(job, changes)
  job.updatedAt = new Date().toISOString()
  store.save(job)
}

/**
 * Creates a job and starts its pipeline in the background. Returns the job
 * record immediately (status 'pending'); callers poll getJob/listJobs.
 */
export function startJob(input: PipelineInput): JobRecord {
  const now = new Date().toISOString()
  const job: JobRecord = {
    jobId: randomUUID(),
    status: 'pending',
    workflow: input.workflow,
    assetId: input.assetId,
    createdAt: now,
    updatedAt: now,
  }
  store.save(job)
  ensureReconciliationLoop()

  // Fire-and-forget; the pipeline records its own outcome on the job record.
  void runPipeline(job, input)

  return job
}

async function runPipeline(
  job: JobRecord,
  input: PipelineInput,
): Promise<void> {
  const config = getComfyUIConfig()
  let stage: JobStatus = 'pending'
  try {
    let imageName: string | undefined
    let originalBasename: string | undefined

    if (input.assetId) {
      stage = 'downloading'
      update(job, {status: stage})
      const {blob, filename} = await downloadAssetImage(input.assetId)
      originalBasename = filename.replace(/\.[^.]+$/, '')

      stage = 'uploading-to-comfyui'
      update(job, {status: stage})
      imageName = await uploadImage(blob, filename)
    }

    // Submit to ComfyUI. The prompt now sits in ComfyUI's own queue; the
    // run-timeout below only starts once ComfyUI reports execution_start, so a
    // prompt waiting behind others is never timed out.
    stage = 'queued'
    update(job, {status: stage})
    const graph = prepareWorkflow({
      template: input.template,
      prompt: input.prompt,
      imageName,
    })
    const promptId = await queuePrompt(graph)
    update(job, {promptId})

    const outputs = await waitForExecution(promptId, {
      runTimeoutMs: config.timeoutMs,
      onStart: () => {
        stage = 'running'
        update(job, {status: stage})
      },
      onProgress: (percent) =>
        update(job, {status: 'running', progress: percent}),
    })

    stage = 'saving'
    update(job, {status: stage})
    const output = outputs[0]
    const blob = await downloadOutput(output)
    const ext = extname(output.filename) || '.png'
    const timestamp = Date.now()
    const filename = originalBasename
      ? `${originalBasename}-comfyui${ext}`
      : `comfyui-${timestamp}${ext}`
    const newAssetId = await uploadGeneratedAsset({
      blob,
      filename,
      deviceAssetId: `comfyui-${input.assetId ?? 'txt2img'}-${timestamp}`,
    })

    let stackId: string | undefined
    if (input.assetId) {
      // Best-effort: a failed stack (e.g. the original already in another
      // stack) must not lose the uploaded asset.
      try {
        stackId = await stackWithOriginal(input.assetId, newAssetId)
      } catch (error) {
        log.error(`stacking failed for job ${job.jobId}`, {
          jobId: job.jobId,
          ...errorContext(error),
        })
      }
    }

    let addedToAlbum = false
    try {
      await addToAlbum(config.albumName, newAssetId)
      addedToAlbum = true
    } catch (error) {
      log.error(`album add failed for job ${job.jobId}`, {
        jobId: job.jobId,
        ...errorContext(error),
      })
    }

    update(job, {
      status: 'completed',
      result: {newAssetId, stackId, addedToAlbum},
    })
  } catch (error) {
    update(job, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      failedStage: stage,
    })
    log.error(`job ${job.jobId} failed at ${stage}`, {
      jobId: job.jobId,
      stage,
      ...errorContext(error),
    })
  }
}

// --- Reconciliation poller -------------------------------------------------
// Backstop for ws messages missed during a reconnect gap. For each in-flight
// prompt we still await, consult ComfyUI's /queue and /history as ground truth
// and start/settle the ws waiter accordingly, so nothing hangs forever.

let reconcileTimer: ReturnType<typeof setInterval> | undefined
let reconciling = false

function ensureReconciliationLoop(): void {
  if (reconcileTimer) return
  const {pollIntervalMs} = getComfyUIConfig()
  reconcileTimer = setInterval(() => {
    if (reconciling) return
    reconciling = true
    void reconcile().finally(() => {
      reconciling = false
    })
  }, pollIntervalMs)
  reconcileTimer.unref()
}

async function reconcile(): Promise<void> {
  const inflight = store
    .list()
    .filter((job) => job.promptId && isAwaiting(job.promptId))
  if (inflight.length === 0) return

  let queue
  try {
    queue = await getQueueState()
  } catch {
    return // ComfyUI unreachable; try again next tick.
  }

  for (const job of inflight) {
    const promptId = job.promptId
    if (!promptId || !isAwaiting(promptId)) continue

    if (queue.running.has(promptId)) {
      notifyStarted(promptId) // arms run-timer + flips job to 'running'
      continue
    }
    if (queue.pending.has(promptId)) continue // still waiting in queue

    // Gone from the queue: either finished or errored — history decides.
    try {
      const images = await getHistoryImages(promptId)
      if (images === undefined) continue // not recorded yet; transient
      if (images.length > 0) settleResolve(promptId, images)
      else
        settleReject(
          promptId,
          new Error(`ComfyUI prompt ${promptId} produced no output images`),
        )
    } catch (error) {
      settleReject(
        promptId,
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }
}
