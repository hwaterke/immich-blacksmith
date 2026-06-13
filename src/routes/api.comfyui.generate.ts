import {createFileRoute} from '@tanstack/react-router'
import {z} from 'zod'
import {getComfyUIConfig} from '../lib/comfyui/config'
import {startJob} from '../lib/comfyui/jobs'
import {
  loadWorkflowTemplate,
  templateRequiresImage,
  WorkflowError,
} from '../lib/comfyui/workflow'

const BodySchema = z.object({
  prompt: z.string().min(1),
  assetId: z.string().uuid().optional(),
  workflow: z.string().min(1),
})

export const Route = createFileRoute('/api/comfyui/generate')({
  server: {
    handlers: {
      POST: async ({request}) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({error: 'Invalid JSON body'}, {status: 400})
        }

        const parsed = BodySchema.safeParse(body)
        if (!parsed.success) {
          return Response.json(
            {error: 'Invalid body', issues: parsed.error.issues},
            {status: 400},
          )
        }
        const {prompt, assetId, workflow: workflowName} = parsed.data

        try {
          getComfyUIConfig()
        } catch (error) {
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
            return Response.json({error: error.message}, {status: 400})
          }
          throw error
        }

        if (templateRequiresImage(template) && assetId == null) {
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

        return Response.json(
          {jobId: job.jobId, status: job.status},
          {status: 202},
        )
      },
    },
  },
})
