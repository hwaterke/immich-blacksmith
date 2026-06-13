import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {getQueryEmbedding} from './embedding'

const okResponse = (embedding: string) =>
  new Response(JSON.stringify({clip: embedding}), {status: 200})

describe('getQueryEmbedding (text path)', () => {
  beforeEach(() => {
    vi.stubEnv('MACHINE_LEARNING_URL', 'http://ml.test:3003')
    // Bypasses the system_metadata lookup so no DB access is needed.
    vi.stubEnv('CLIP_MODEL_NAME', 'ViT-B-32__openai')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('posts the query text to /predict and returns the embedding', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('[0.1,0.2]'))
    vi.stubGlobal('fetch', fetchMock)

    const embedding = await getQueryEmbedding({
      text: 'cats playing',
      language: 'en',
    })
    expect(embedding).toBe('[0.1,0.2]')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://ml.test:3003/predict')
    const body = init.body as FormData
    expect(JSON.parse(body.get('entries') as string)).toEqual({
      clip: {
        textual: {modelName: 'ViT-B-32__openai', options: {language: 'en'}},
      },
    })
    expect(body.get('text')).toBe('cats playing')
  })

  it('caches embeddings for identical queries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('[0.3]'))
    vi.stubGlobal('fetch', fetchMock)

    await getQueryEmbedding({text: 'same query twice'})
    await getQueryEmbedding({text: 'same query twice'})
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('fails with a clear error when MACHINE_LEARNING_URL is unset', async () => {
    vi.stubEnv('MACHINE_LEARNING_URL', '')
    await expect(getQueryEmbedding({text: 'dogs'})).rejects.toThrow(
      'MACHINE_LEARNING_URL',
    )
  })

  it('fails on non-OK responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('boom', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
      ),
    )
    await expect(getQueryEmbedding({text: 'horses'})).rejects.toThrow('500')
  })

  it('fails when the response has no clip embedding', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({}), {status: 200})),
    )
    await expect(getQueryEmbedding({text: 'birds'})).rejects.toThrow(
      'missing clip embedding',
    )
  })
})
