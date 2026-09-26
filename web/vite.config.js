import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const parentEnv = loadEnv(mode, '..', '')
  return {
    plugins: [react()],
    server: { port: 4173 },
    build: { sourcemap: true },
    define: {
      __CLERK_KEY__: JSON.stringify(parentEnv.VITE_CLERK_PUBLISHABLE_KEY || parentEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''),
      __API_BASE__: JSON.stringify(parentEnv.VITE_API_BASE_URL || 'https://sage-ai-backend-hazel.vercel.app'),
    },
  }
})
