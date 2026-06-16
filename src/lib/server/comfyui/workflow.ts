import '@tanstack/react-start/server-only'
import {readFile, readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {getComfyUIConfig} from './config'
import type {WorkflowGraph} from './client'

/** Names allowed for workflow files; blocks path traversal into the filesystem. */
const WORKFLOW_NAME_RE = /^[a-zA-Z0-9_-]+$/

const PROMPT_PLACEHOLDER = '%%PROMPT%%'
const IMAGE_PLACEHOLDER = '%%IMAGE%%'
const SEED_PLACEHOLDER = '%%SEED%%'

/** Error whose message is safe to return to the client with a 400 status. */
export class WorkflowError extends Error {}

/**
 * Reads a workflow template by name as raw text (placeholders are substituted
 * before JSON parsing, so this stays a string). Validates the name first to
 * prevent reading arbitrary files. Throws WorkflowError for bad/unknown names.
 */
export async function loadWorkflowTemplate(name: string): Promise<string> {
  if (!WORKFLOW_NAME_RE.test(name)) {
    throw new WorkflowError(
      `Invalid workflow name "${name}"; allowed characters: a-z A-Z 0-9 _ -`,
    )
  }

  const {workflowsDir} = getComfyUIConfig()
  const path = join(workflowsDir, `${name}.json`)
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new WorkflowError(`Unknown workflow "${name}"`)
    }
    throw error
  }
}

/** True if the template uses an input image (and therefore needs an assetId). */
export function templateRequiresImage(template: string): boolean {
  return template.includes(IMAGE_PLACEHOLDER)
}

export type WorkflowInfo = {name: string; requiresImage: boolean}

/**
 * Lists the available workflows (by reading the templates directory), each
 * tagged with whether it expects an input image. Returns an empty list if the
 * directory does not exist. Files whose names contain disallowed characters are
 * skipped (they could never be selected anyway).
 */
export async function listWorkflows(): Promise<WorkflowInfo[]> {
  const {workflowsDir} = getComfyUIConfig()

  let entries: string[]
  try {
    entries = await readdir(workflowsDir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const names = entries
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
    .filter((name) => WORKFLOW_NAME_RE.test(name))
    .sort()

  return await Promise.all(
    names.map(async (name) => {
      const template = await loadWorkflowTemplate(name)
      return {name, requiresImage: templateRequiresImage(template)}
    }),
  )
}

/**
 * Substitutes the placeholders in a template and parses it into a workflow
 * graph. `imageName` is required iff the template contains %%IMAGE%%.
 */
export function prepareWorkflow({
  template,
  prompt,
  imageName,
}: {
  template: string
  prompt: string
  imageName?: string
}): WorkflowGraph {
  if (templateRequiresImage(template) && imageName == null) {
    throw new WorkflowError(
      'This workflow requires an input image; provide an assetId',
    )
  }

  // Random 15-digit seed so repeated runs of the same prompt differ. JSON-encode
  // each value so it lands as a proper string/number literal in the template.
  const seed = Math.floor(Math.random() * 1_000_000_000_000_000)
  let filled = template
    .split(PROMPT_PLACEHOLDER)
    .join(jsonInsert(prompt))
    .split(SEED_PLACEHOLDER)
    .join(String(seed))
  if (imageName != null) {
    filled = filled.split(IMAGE_PLACEHOLDER).join(jsonInsert(imageName))
  }

  try {
    return JSON.parse(filled) as WorkflowGraph
  } catch (error) {
    throw new Error(
      `Failed to parse workflow after substitution: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

/**
 * Escapes a string for insertion into a JSON string literal, returning the
 * content without surrounding quotes (the template already supplies the quotes
 * around the placeholder, e.g. `"text": "%%PROMPT%%"`).
 */
function jsonInsert(value: string): string {
  const encoded = JSON.stringify(value)
  return encoded.slice(1, -1)
}
