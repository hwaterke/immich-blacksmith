import '@tanstack/react-start/server-only'
import {getComfyUIConfig} from './config'
import {CLIENT_ID, getHistoryImages} from './client'
import type {ComfyUIImageRef} from './client'
import {createLogger, errorContext} from '../logger'

const log = createLogger('comfyui')

/**
 * Shared ComfyUI WebSocket.
 *
 * A single process-wide connection to ComfyUI's `/ws` (opened with our
 * {@link CLIENT_ID}) receives execution events for every prompt we submit.
 * Messages carry a `prompt_id`, so one socket is demultiplexed to the right
 * waiting job. The connection is opened lazily and reconnects with backoff.
 *
 * The key behaviour: a job's run-timeout clock only starts when ComfyUI reports
 * `execution_start` for that prompt. While a prompt sits in ComfyUI's queue it
 * is *not* timed out — that is the fix for "later jobs time out" when many are
 * queued at once.
 */

type ProgressFn = (percent: number) => void

type Pending = {
  started: boolean
  runTimeoutMs: number
  runTimer?: ReturnType<typeof setTimeout>
  onStart?: () => void
  onProgress?: ProgressFn
  resolve: (refs: ComfyUIImageRef[]) => void
  reject: (error: Error) => void
}

const pending = new Map<string, Pending>()

let socket: WebSocket | undefined
let reconnectTimer: ReturnType<typeof setTimeout> | undefined
let reconnectDelayMs = 1_000
const MAX_RECONNECT_DELAY_MS = 30_000

function wsUrl(): string {
  const {baseUrl} = getComfyUIConfig()
  const ws = baseUrl.replace(/^http/, 'ws')
  return `${ws}/ws?clientId=${CLIENT_ID}`
}

/** Opens the socket if it isn't already open or connecting. Safe to call often. */
export function ensureConnected(): void {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return
  }

  let next: WebSocket
  try {
    next = new WebSocket(wsUrl())
  } catch (error) {
    log.error('failed to open ws', {...errorContext(error)})
    scheduleReconnect()
    return
  }
  socket = next

  next.addEventListener('open', () => {
    reconnectDelayMs = 1_000
  })
  next.addEventListener('message', (event) => handleMessage(event.data))
  next.addEventListener('error', () => {
    // The accompanying 'close' drives the reconnect; just avoid an unhandled error.
  })
  next.addEventListener('close', () => {
    if (socket === next) socket = undefined
    // Only reconnect while we still have jobs depending on the socket.
    if (pending.size > 0) scheduleReconnect()
  })
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  const delay = reconnectDelayMs
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined
    if (pending.size > 0) ensureConnected()
  }, delay)
  reconnectTimer.unref()
}

function handleMessage(data: unknown): void {
  // ComfyUI also sends binary frames (preview images); ignore non-text.
  if (typeof data !== 'string') return

  let message: {type?: string; data?: Record<string, unknown>}
  try {
    message = JSON.parse(data)
  } catch {
    return
  }
  const type = message.type
  const payload = message.data ?? {}
  const promptId =
    typeof payload.prompt_id === 'string' ? payload.prompt_id : undefined
  if (!promptId) return
  const entry = pending.get(promptId)
  if (!entry) return

  switch (type) {
    case 'execution_start':
      startRunTimer(promptId, entry)
      break
    case 'progress': {
      const value = Number(payload.value)
      const max = Number(payload.max)
      if (Number.isFinite(value) && Number.isFinite(max) && max > 0) {
        entry.onProgress?.(Math.min(100, Math.round((value / max) * 100)))
      }
      break
    }
    case 'execution_error':
      settleReject(
        promptId,
        new Error(
          `ComfyUI workflow failed: ${
            typeof payload.exception_message === 'string'
              ? payload.exception_message
              : JSON.stringify(payload)
          }`,
        ),
      )
      break
    case 'execution_success':
      void completeFromHistory(promptId)
      break
    case 'executing':
      // Older ComfyUI signals completion with `executing` + node === null.
      if (payload.node == null) void completeFromHistory(promptId)
      break
  }
}

/** Idempotently marks a prompt started and arms its run-timeout. */
export function notifyStarted(promptId: string): void {
  const entry = pending.get(promptId)
  if (entry) startRunTimer(promptId, entry)
}

function startRunTimer(promptId: string, entry: Pending): void {
  if (entry.started) return
  entry.started = true
  entry.onStart?.()
  entry.runTimer = setTimeout(() => {
    settleReject(
      promptId,
      new Error(
        `ComfyUI prompt ${promptId} did not finish within ${entry.runTimeoutMs}ms of starting`,
      ),
    )
  }, entry.runTimeoutMs)
  entry.runTimer.unref()
}

/** Resolves a waiter from ComfyUI history (the source of truth for outputs). */
async function completeFromHistory(promptId: string): Promise<void> {
  if (!pending.has(promptId)) return
  try {
    const images = await getHistoryImages(promptId)
    if (images && images.length > 0) {
      settleResolve(promptId, images)
    } else {
      settleReject(
        promptId,
        new Error(`ComfyUI prompt ${promptId} finished with no output images`),
      )
    }
  } catch (error) {
    settleReject(
      promptId,
      error instanceof Error ? error : new Error(String(error)),
    )
  }
}

function cleanup(promptId: string): Pending | undefined {
  const entry = pending.get(promptId)
  if (!entry) return undefined
  if (entry.runTimer) clearTimeout(entry.runTimer)
  pending.delete(promptId)
  return entry
}

/** Resolve a waiter (used by the reconciliation poller and ws handlers). */
export function settleResolve(promptId: string, refs: ComfyUIImageRef[]): void {
  cleanup(promptId)?.resolve(refs)
}

/** Reject a waiter (used by the reconciliation poller and ws handlers). */
export function settleReject(promptId: string, error: Error): void {
  cleanup(promptId)?.reject(error)
}

/** True while a prompt has a pending waiter (i.e. its job is in flight). */
export function isAwaiting(promptId: string): boolean {
  return pending.has(promptId)
}

/**
 * Resolves once ComfyUI finishes executing `promptId`. The run-timeout only
 * applies after execution actually starts; time spent queued does not count.
 */
export function waitForExecution(
  promptId: string,
  {
    runTimeoutMs,
    onStart,
    onProgress,
  }: {runTimeoutMs: number; onStart?: () => void; onProgress?: ProgressFn},
): Promise<ComfyUIImageRef[]> {
  ensureConnected()
  return new Promise<ComfyUIImageRef[]>((resolve, reject) => {
    pending.set(promptId, {
      started: false,
      runTimeoutMs,
      onStart,
      onProgress,
      resolve,
      reject,
    })
  })
}
