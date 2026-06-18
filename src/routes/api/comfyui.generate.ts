import {createFileRoute} from '@tanstack/react-router'
import {z} from 'zod'
import {getComfyUIConfig} from '../../lib/server/comfyui/config'
import {startJob} from '../../lib/server/comfyui/jobs'
import {
  loadWorkflowTemplate,
  templateRequiresImage,
  WorkflowError,
} from '../../lib/server/comfyui/workflow'
import {
  createLogger,
  errorContext,
  withRequestLogging,
} from '../../lib/server/logger'

const log = createLogger('api:comfyui:generate')

const BodySchema = z.object({
  prompt: z.string().min(1),
  assetId: z.string().uuid().optional(),
  workflow: z.string().min(1),
})

export const Route = createFileRoute('/api/comfyui/generate')({
  server: {
    handlers: {
      POST: withRequestLogging('api:comfyui:generate', async ({request}) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          log.warn('Invalid JSON body')
          return Response.json({error: 'Invalid JSON body'}, {status: 400})
        }

        const parsed = BodySchema.safeParse(body)
        if (!parsed.success) {
          log.warn('Invalid body', {issues: parsed.error.issues})
          return Response.json(
            {error: 'Invalid body', issues: parsed.error.issues},
            {status: 400},
          )
        }
        const {prompt, assetId, workflow: workflowName} = parsed.data

        try {
          getComfyUIConfig()
        } catch (error) {
          log.error('ComfyUI not configured', {...errorContext(error)})
          return Response.json(
            {error: error instanceof Error ? error.message : String(error)},
            {status: 500},
          )
        }

        let template: string
        try {
          template = await loadWorkflowTemplate(workflowName)
        } catch (error) {
          if (error instanceof WorkflowError) {
            log.warn('Workflow load failed', {
              workflow: workflowName,
              ...errorContext(error),
            })
            return Response.json({error: error.message}, {status: 400})
          }
          throw error
        }

        if (templateRequiresImage(template) && assetId == null) {
          log.warn('Workflow requires an input image but none provided', {
            workflow: workflowName,
          })
          return Response.json(
            {
              error: `Workflow "${workflowName}" requires an input image; provide an assetId`,
            },
            {status: 400},
          )
        }

        const job = startJob({
          template,
          workflow: workflowName,
          prompt,
          assetId,
        })
        log.info('Started ComfyUI job', {
          jobId: job.jobId,
          workflow: workflowName,
          assetId,
        })

        return Response.json(
          {jobId: job.jobId, status: job.status},
          {status: 202},
        )
      }),
    },
  },
})
