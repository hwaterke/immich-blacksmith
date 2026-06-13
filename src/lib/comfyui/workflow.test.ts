import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {
  listWorkflows,
  loadWorkflowTemplate,
  prepareWorkflow,
  templateRequiresImage,
  WorkflowError,
} from './workflow'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('templateRequiresImage', () => {
  it('detects the image placeholder', () => {
    expect(templateRequiresImage('{"image":"%%IMAGE%%"}')).toBe(true)
    expect(templateRequiresImage('{"text":"%%PROMPT%%"}')).toBe(false)
  })
})

describe('prepareWorkflow', () => {
  it('substitutes prompt, seed and image into a graph', () => {
    const template =
      '{"a":{"class_type":"X","inputs":{"text":"%%PROMPT%%","seed":%%SEED%%,"image":"%%IMAGE%%"}}}'
    const graph = prepareWorkflow({
      template,
      prompt: 'a red cat',
      imageName: 'sub/photo.jpg',
    })
    const inputs = graph.a.inputs
    expect(inputs.text).toBe('a red cat')
    expect(inputs.image).toBe('sub/photo.jpg')
    expect(typeof inputs.seed).toBe('number')
  })

  it('produces a different seed on each run', () => {
    const template = '{"a":{"class_type":"X","inputs":{"seed":%%SEED%%}}}'
    const seeds = new Set(
      Array.from(
        {length: 20},
        () => prepareWorkflow({template, prompt: 'x'}).a.inputs.seed as number,
      ),
    )
    expect(seeds.size).toBeGreaterThan(1)
  })

  it('escapes characters that would break the JSON', () => {
    const template = '{"a":{"class_type":"X","inputs":{"text":"%%PROMPT%%"}}}'
    const graph = prepareWorkflow({
      template,
      prompt: 'quote " and \\ backslash',
    })
    expect(graph.a.inputs.text).toBe('quote " and \\ backslash')
  })

  it('throws when an image-requiring template gets no imageName', () => {
    const template = '{"a":{"class_type":"X","inputs":{"image":"%%IMAGE%%"}}}'
    expect(() => prepareWorkflow({template, prompt: 'x'})).toThrow(
      WorkflowError,
    )
  })
})

describe('loadWorkflowTemplate', () => {
  it('rejects path-traversal / invalid names', async () => {
    vi.stubEnv('COMFYUI_URL', 'http://comfyui.test:8188')
    vi.stubEnv('COMFYUI_WORKFLOWS_DIR', join(tmpdir(), 'comfy-workflows'))
    await expect(loadWorkflowTemplate('../secrets')).rejects.toBeInstanceOf(
      WorkflowError,
    )
    await expect(loadWorkflowTemplate('a/b')).rejects.toBeInstanceOf(
      WorkflowError,
    )
  })

  it('throws WorkflowError for an unknown workflow', async () => {
    vi.stubEnv('COMFYUI_URL', 'http://comfyui.test:8188')
    vi.stubEnv('COMFYUI_WORKFLOWS_DIR', join(tmpdir(), 'comfy-does-not-exist'))
    await expect(
      loadWorkflowTemplate('definitely-not-here'),
    ).rejects.toBeInstanceOf(WorkflowError)
  })
})

describe('listWorkflows', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, {recursive: true, force: true})
  })

  it('lists workflows tagged by image requirement, skipping non-json/bad names', async () => {
    dir = await mkdtemp(join(tmpdir(), 'comfy-workflows-'))
    await writeFile(join(dir, 'edit.json'), '{"a":{"image":"%%IMAGE%%"}}')
    await writeFile(join(dir, 'dream.json'), '{"a":{"text":"%%PROMPT%%"}}')
    await writeFile(join(dir, 'notes.txt'), 'ignored')
    await writeFile(join(dir, 'bad name.json'), '{}')
    vi.stubEnv('COMFYUI_URL', 'http://comfyui.test:8188')
    vi.stubEnv('COMFYUI_WORKFLOWS_DIR', dir)

    const workflows = await listWorkflows()
    expect(workflows).toEqual([
      {name: 'dream', requiresImage: false},
      {name: 'edit', requiresImage: true},
    ])
  })

  it('returns an empty list when the directory does not exist', async () => {
    vi.stubEnv('COMFYUI_URL', 'http://comfyui.test:8188')
    vi.stubEnv('COMFYUI_WORKFLOWS_DIR', join(tmpdir(), 'comfy-does-not-exist'))
    expect(await listWorkflows()).toEqual([])
  })
})
