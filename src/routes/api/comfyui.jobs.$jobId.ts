import {createFileRoute} from '@tanstack/react-router'
import {getJob} from '../../lib/server/comfyui/jobs'
import {createLogger, withRequestLogging} from '../../lib/server/logger'

const log = createLogger('api:comfyui:job')

export const Route = createFileRoute('/api/comfyui/jobs/$jobId')({
  server: {
    handlers: {
      GET: withRequestLogging('api:comfyui:job', async ({params}) => {
        const job = getJob(params.jobId)
        if (!job) {
          log.warn('Job not found', {jobId: params.jobId})
          return Response.json({error: 'Job not found'}, {status: 404})
        }
        return Response.json(job)
      }),
    },
  },
})
