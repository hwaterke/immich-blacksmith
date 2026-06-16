import {createFileRoute} from '@tanstack/react-router'
import {getJob} from '../../lib/server/comfyui/jobs'

export const Route = createFileRoute('/api/comfyui/jobs/$jobId')({
  server: {
    handlers: {
      GET: async ({params}) => {
        const job = getJob(params.jobId)
        if (!job) {
          return Response.json({error: 'Job not found'}, {status: 404})
        }
        return Response.json(job)
      },
    },
  },
})
