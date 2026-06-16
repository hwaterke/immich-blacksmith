import '@tanstack/react-start/server-only'
import {randomUUID} from 'node:crypto'
import {getComfyUIConfig} from './config'

/**
 * One stable client id for this Blacksmith process. Passed on every `/prompt`
 * submission and used to open the shared WebSocket, so ComfyUI routes execution
 * events back to us. Lives here (rather than ws.ts) to keep the dependency
 * direction one-way: ws.ts depends on client.ts, never the reverse.
 */
export const CLIENT_ID = randomUUID()

/** A node-id → node map in ComfyUI API format (the shape `/prompt` accepts). */
export type WorkflowGraph = Record<
  string,
  {class_type: string; inputs: Record<string, unknown>}
>

/** Reference to a file in ComfyUI's input/output/temp directories. */
export type ComfyUIImageRef = {
  filename: string
  subfolder: string
  type: string
}

type UploadImageResponse = {name: string; subfolder?: string; type?: string}
type QueuePromptResponse = {
  prompt_id: string
  node_errors?: Record<string, unknown>
}
type HistoryEntry = {
  outputs?: Record<string, {images?: ComfyUIImageRef[]}>
  status?: {status_str?: string; completed?: boolean; messages?: unknown[]}
}

async function comfyFetch(path: string, init?: RequestInit): Promise<Response> {
  const {baseUrl} = getComfyUIConfig()
  const url = `${baseUrl}${path}`
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    throw new Error(
      `Could not reach ComfyUI at ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 500)
    throw new Error(
      `ComfyUI request failed (${response.status} ${response.statusText}) for ${path}${
        detail ? `: ${detail}` : ''
      }`,
    )
  }
  return response
}

/**
 * Uploads an image to ComfyUI's input directory. Returns the filename
 * (subfolder-qualified) to set on a LoadImage node's `image` input.
 */
export async function uploadImage(
  blob: Blob,
  filename: string,
): Promise<string> {
  const form = new FormData()
  form.append('image', blob, filename)
  form.append('overwrite', 'true')

  const response = await comfyFetch('/upload/image', {
    method: 'POST',
    body: form,
  })
  const body = (await response.json()) as UploadImageResponse
  return body.subfolder ? `${body.subfolder}/${body.name}` : body.name
}

/** Queues a workflow graph and returns the prompt id used to track it. */
export async function queuePrompt(graph: WorkflowGraph): Promise<string> {
  const response = await comfyFetch('/prompt', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({prompt: graph, client_id: CLIENT_ID}),
  })
  const body = (await response.json()) as QueuePromptResponse
  if (body.node_errors && Object.keys(body.node_errors).length > 0) {
    throw new Error(
      `ComfyUI rejected the workflow: ${JSON.stringify(body.node_errors)}`,
    )
  }
  if (!body.prompt_id) {
    throw new Error('ComfyUI did not return a prompt_id')
  }
  return body.prompt_id
}

/**
 * Reads `/history/{promptId}` once. Returns the prompt's output image refs (an
 * empty array if the entry exists but has produced no images yet), or
 * `undefined` when there is no history entry at all. Throws if ComfyUI recorded
 * the prompt as errored.
 *
 * This is the ground truth used both when the shared WebSocket reports a prompt
 * finished and by the reconciliation poller that backstops missed ws messages.
 */
export async function getHistoryImages(
  promptId: string,
): Promise<ComfyUIImageRef[] | undefined> {
  const response = await comfyFetch(`/history/${promptId}`)
  const history = (await response.json()) as Record<
    string,
    HistoryEntry | undefined
  >
  const entry = history[promptId]
  if (!entry) return undefined
  if (entry.status?.status_str === 'error') {
    throw new Error(
      `ComfyUI workflow failed: ${JSON.stringify(entry.status.messages ?? [])}`,
    )
  }
  return Object.values(entry.outputs ?? {}).flatMap(
    (output) => output.images ?? [],
  )
}

/** prompt_ids ComfyUI currently reports as running vs. waiting in its queue. */
export type QueueState = {running: Set<string>; pending: Set<string>}

/**
 * Reads `/queue`. Each entry is a tuple `[number, prompt_id, prompt, ...]`, so
 * the prompt id is at index 1.
 */
export async function getQueueState(): Promise<QueueState> {
  const response = await comfyFetch('/queue')
  const body = (await response.json()) as {
    queue_running?: unknown[][]
    queue_pending?: unknown[][]
  }
  const idsOf = (entries?: unknown[][]): Set<string> =>
    new Set((entries ?? []).map((entry) => String(entry[1])))
  return {
    running: idsOf(body.queue_running),
    pending: idsOf(body.queue_pending),
  }
}

/** Downloads the bytes of an output image as a Blob. */
export async function downloadOutput(ref: ComfyUIImageRef): Promise<Blob> {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  })
  const response = await comfyFetch(`/view?${params.toString()}`)
  return await response.blob()
}
