import '@tanstack/react-start/server-only'
import {db} from './db'
import type {SearchQuery} from '../shared/searchTypes'

// Default CLIP model in Immich (server/src/config.ts).
const DEFAULT_CLIP_MODEL = 'ViT-B-32__openai'

const EMBEDDING_CACHE_MAX = 100
const embeddingCache = new Map<string, string>()

let cachedModelName: string | undefined

/**
 * Resolves the CLIP model name used by the Immich instance, so query
 * embeddings match the ones stored in smart_search. A customized model lives
 * in system_metadata under the 'system-config' key; absent means the default.
 */
async function getClipModelName(): Promise<string> {
  if (process.env.CLIP_MODEL_NAME) {
    return process.env.CLIP_MODEL_NAME
  }
  if (cachedModelName !== undefined) {
    return cachedModelName
  }
  const row = await db
    .selectFrom('system_metadata')
    .select('value')
    .where('key', '=', 'system-config')
    .executeTakeFirst()
  const config = row?.value as
    | {machineLearning?: {clip?: {modelName?: unknown}}}
    | null
    | undefined
  const modelName = config?.machineLearning?.clip?.modelName
  cachedModelName =
    typeof modelName === 'string' && modelName.length > 0
      ? modelName
      : DEFAULT_CLIP_MODEL
  return cachedModelName
}

/**
 * Encodes query text into a CLIP embedding by calling the Immich
 * machine-learning service, mirroring the request format of
 * MachineLearningRepository.encodeText in the Immich server.
 */
async function encodeText(text: string, language?: string): Promise<string> {
  const baseUrl = process.env.MACHINE_LEARNING_URL
  if (!baseUrl) {
    throw new Error(
      'MACHINE_LEARNING_URL is not set; text queries require access to the Immich machine-learning service',
    )
  }

  const modelName = await getClipModelName()
  const cacheKey = `${modelName}\0${text}\0${language ?? ''}`
  const cached = embeddingCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const formData = new FormData()
  formData.append(
    'entries',
    JSON.stringify({clip: {textual: {modelName, options: {language}}}}),
  )
  formData.append('text', text)

  const url = `${baseUrl.replace(/\/+$/, '')}/predict`
  let response: Response
  try {
    response = await fetch(url, {method: 'POST', body: formData})
  } catch (error) {
    throw new Error(
      `Could not reach the machine-learning service at ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  if (!response.ok) {
    throw new Error(
      `Machine-learning service request failed: ${response.status} ${response.statusText}`,
    )
  }

  const body = (await response.json()) as {clip?: unknown}
  if (typeof body.clip !== 'string') {
    throw new Error(
      'Unexpected machine-learning service response: missing clip embedding',
    )
  }

  if (embeddingCache.size >= EMBEDDING_CACHE_MAX) {
    const oldestKey = embeddingCache.keys().next().value
    if (oldestKey !== undefined) {
      embeddingCache.delete(oldestKey)
    }
  }
  embeddingCache.set(cacheKey, body.clip)
  return body.clip
}

/**
 * Resolves a search query to an embedding string usable with the pgvector
 * `<=>` operator: either the stored embedding of a reference asset, or a
 * freshly encoded text query.
 */
export async function getQueryEmbedding(query: SearchQuery): Promise<string> {
  if (query.text !== undefined) {
    return await encodeText(query.text, query.language)
  }
  if (query.assetId !== undefined) {
    const row = await db
      .selectFrom('smart_search')
      .select('embedding')
      .where('assetId', '=', query.assetId)
      .executeTakeFirst()
    if (!row) {
      throw new Error(`Asset ${query.assetId} has no smart-search embedding`)
    }
    return row.embedding
  }
  throw new Error('query must include either text or assetId')
}
