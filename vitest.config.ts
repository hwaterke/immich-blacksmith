import {defineConfig} from 'vitest/config'

// Pure unit tests run in a plain node environment without the app's
// vite plugin stack (TanStack Start / Nitro / React), keeping them fast
// and free of dev-server teardown noise.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
