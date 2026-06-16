import '@tanstack/react-start/server-only'
import {init} from '@immich/sdk'

let initialized = false

export function ensureImmichInit() {
  if (initialized) return

  const baseUrl = process.env.IMMICH_URL
  const apiKey = process.env.IMMICH_API_KEY

  if (!baseUrl) {
    throw new Error('IMMICH_URL environment variable is not set')
  }
  if (!apiKey) {
    throw new Error('IMMICH_API_KEY environment variable is not set')
  }

  init({baseUrl, apiKey})
  initialized = true
}

export function getImmichWebUrl(): string {
  const baseUrl = process.env.IMMICH_URL
  if (!baseUrl) {
    throw new Error('IMMICH_URL environment variable is not set')
  }
  return baseUrl.replace(/\/+$/, '').replace(/\/api$/, '')
}
