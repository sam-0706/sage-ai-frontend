export const DEFAULT_API_BASE = 'https://sage-ai-backend-hazel.vercel.app'

export function resolveApiBase(value) {
  const base = (value || DEFAULT_API_BASE).trim()
  let url
  try { url = new URL(base) } catch {
    throw new Error('SAGE_API_BASE_URL must be the backend HTTP(S) URL, never an API key or relative path.')
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('SAGE_API_BASE_URL must be an HTTP(S) backend URL without credentials, query parameters or fragments.')
  }
  return base.replace(/\/+$/, '')
}
