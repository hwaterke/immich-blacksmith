import {createFileRoute} from '@tanstack/react-router'
import {getComfyUIConfig} from '../../lib/server/comfyui/config'
import {listWorkflows} from '../../lib/server/comfyui/workflow'
import {
  createLogger,
  errorContext,
  withRequestLogging,
} from '../../lib/server/logger'

const log = createLogger('api:comfyui:workflows')

export const Route = createFileRoute('/api/comfyui/workflows')({
  server: {
    handlers: {
      GET: withRequestLogging('api:comfyui:workflows', async ({request}) => {
        try {
          getComfyUIConfig()
        } catch (error) {
          log.error('ComfyUI not configured', {...errorContext(error)})
          return Response.json(
            {error: error instanceof Error ? error.message : String(error)},
            {status: 500},
          )
        }

        // Optional filter: requiresImage=true → img2img only, =false → txt2img only.
        const raw = new URL(request.url).searchParams.get('requiresImage')
        if (raw != null && raw !== 'true' && raw !== 'false') {
          log.warn('Invalid requiresImage filter', {requiresImage: raw})
          return Response.json(
            {error: "requiresImage must be 'true' or 'false'"},
            {status: 400},
          )
        }

        let workflows = await listWorkflows()
        if (raw === 'true') {
          workflows = workflows.filter((w) => w.requiresImage)
        } else if (raw === 'false') {
          workflows = workflows.filter((w) => !w.requiresImage)
        }

        return Response.json({workflows})
      }),
    },
  },
})
