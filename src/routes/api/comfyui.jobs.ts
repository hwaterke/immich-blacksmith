import {createFileRoute} from '@tanstack/react-router'
import {z} from 'zod'
import {clearFinishedJobs, listJobs} from '../../lib/server/comfyui/jobs'
import type {JobStatus} from '../../lib/server/comfyui/jobs'
import {createLogger, withRequestLogging} from '../../lib/server/logger'

const log = createLogger('api:comfyui:jobs')

const STATUSES = [
  'pending',
  'downloading',
  'uploading-to-comfyui',
  'queued',
  'running',
  'saving',
  'completed',
  'failed',
] as const satisfies readonly JobStatus[]

const QuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  limit: z.coerce.number().int().positive().optional(),
})

export const Route = createFileRoute('/api/comfyui/jobs')({
  server: {
    handlers: {
      GET: withRequestLogging('api:comfyui:jobs', async ({request}) => {
        const url = new URL(request.url)
        const parsed = QuerySchema.safeParse({
          status: url.searchParams.get('status') ?? undefined,
          limit: url.searchParams.get('limit') ?? undefined,
        })
        if (!parsed.success) {
          log.warn('Invalid query', {issues: parsed.error.issues})
          return Response.json(
            {error: 'Invalid query', issues: parsed.error.issues},
            {status: 400},
          )
        }
        const {status, limit} = parsed.data

        // Newest first; each item carries the full record, including the input
        // image (assetId) and, once completed, the generated output image
        // (result.newAssetId) so a UI can render input/output pairs directly.
        let jobs = listJobs().sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        )
        if (status) jobs = jobs.filter((job) => job.status === status)
        if (limit != null) jobs = jobs.slice(0, limit)

        return Response.json({jobs})
      }),
      DELETE: withRequestLogging('api:comfyui:jobs:clear', async () => {
        const removed = clearFinishedJobs()
        log.info('Cleared finished jobs', {removed})
        return Response.json({removed})
      }),
    },
  },
})
