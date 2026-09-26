import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveApiBase } from './api-config.js'

export default defineConfig(({ mode }) => {
  const parentEnv = { ...loadEnv(mode, '..', ''), ...loadEnv(mode, '.', '') }
  return {
    plugins: [react()],
    // Export only the two explicitly validated public values below.
    // Never spread deployment VITE_* settings into browser bundles.
    envPrefix: [],
    server: { port: 4173 },
    build: { sourcemap: true },
    define: {
      __CLERK_KEY__: JSON.stringify(parentEnv.VITE_CLERK_PUBLISHABLE_KEY || parentEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''),
      __API_BASE__: JSON.stringify(resolveApiBase(parentEnv.SAGE_API_BASE_URL)),
    },
  }
})
