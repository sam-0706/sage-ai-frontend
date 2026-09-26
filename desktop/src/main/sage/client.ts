import { app, shell } from 'electron'
import { hostname } from 'os'
import { deleteSecret, getSecret, setSecret } from '../secrets/keychain'
import type { SageAuthState } from '@shared/sage'

/**
 * SAGE backend client. The session token lives only in the main process (OS-encrypted);
 * the renderer calls `sage:request` with a /v1 path and never sees the token.
 */
const DEFAULT_API = 'https://sage-ai-backend-hazel.vercel.app'
const TOKEN_SECRET = 'sage:session-token'

export function apiBase(): string {
  return (process.env.SAGE_API_URL || import.meta.env.MAIN_VITE_SAGE_API_URL || DEFAULT_API).replace(/\/$/, '')
}

/** Local development only: authenticate as a waitlisted email against a backend running with DEV_AUTH_BYPASS. */
function devEmail(): string | null {
  return !app.isPackaged && process.env.SAGE_DEV_EMAIL ? process.env.SAGE_DEV_EMAIL : null
}

export function sessionToken(): string | null {
  return getSecret(TOKEN_SECRET)
}

export class SageApiError extends Error {
  constructor(message: string, public status: number, public code: string, public details: unknown = {}) {
    super(message)
  }
}

const pendingReads = new Map<string, Promise<unknown>>()
let meResult: { key: string; data: unknown; at: number } | null = null
export function sageRequest<T = unknown>(method: string, path: string, body?: unknown, timeoutMs?: number): Promise<T> {
  const key = `${apiBase()}:${devEmail() || sessionToken() || 'anonymous'}:${path}`
  if (method !== 'GET') { meResult = null; return requestUncached<T>(method, path, body, timeoutMs) }
  if (path === '/v1/me' && meResult?.key === key && Date.now() - meResult.at < 3000) return Promise.resolve(meResult.data as T)
  if (pendingReads.has(key)) return pendingReads.get(key) as Promise<T>
  const request = requestUncached<T>(method, path, body, timeoutMs).then(data => {
    if (path === '/v1/me') meResult = { key, data, at: Date.now() }
    return data
  }).finally(() => pendingReads.delete(key))
  pendingReads.set(key, request)
  return request
}

async function requestUncached<T = unknown>(method: string, path: string, body?: unknown, timeoutMs = method === 'GET' ? 20_000 : 120_000): Promise<T> {
  if (!path.startsWith('/v1/')) throw new SageApiError('Only /v1 API paths are allowed', 400, 'invalid_path')
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = sessionToken()
  const dev = token ? null : devEmail()
  if (dev) headers['X-Dev-User-Email'] = dev
  else if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let resp: Response
  try {
    resp = await fetch(`${apiBase()}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (e) {
    throw new SageApiError('Could not reach SAGE — check your internet connection.', 0, 'network_error')
  }
  const text = await resp.text()
  const data = text ? safeJson(text) : null
  if (!resp.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error
    if (resp.status === 401 && token && !dev) authEvents.emit({ status: 'signed_out', reason: err?.message })
    throw new SageApiError(err?.message || `Request failed (HTTP ${resp.status})`, resp.status, err?.code || 'http_error', err?.details)
  }
  return data as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 500) }
  }
}

// ---------------------------------------------------------------- device sign-in
type Listener = (s: SageAuthState) => void
const listeners = new Set<Listener>()
export const authEvents = {
  on: (l: Listener) => listeners.add(l),
  emit: (s: SageAuthState) => listeners.forEach((l) => l(s))
}

let pending: { cancelled: boolean } | null = null

export async function authStatus(): Promise<SageAuthState> {
  if (!devEmail() && !sessionToken()) return { status: 'signed_out' }
  try {
    const me = await sageRequest<{ user: { email: string; full_name: string | null } }>('GET', '/v1/me', undefined, 20_000)
    return { status: 'signed_in', email: me.user.email, name: me.user.full_name ?? undefined, dev: !sessionToken() && !!devEmail() }
  } catch (e) {
    if (e instanceof SageApiError && (e.status === 401 || e.status === 403)) {
      if (e.status === 401) deleteSecret(TOKEN_SECRET)
      return { status: 'signed_out', reason: e.message, code: e.code }
    }
    // offline: keep the session, let the UI show a connectivity notice
    return { status: 'offline', reason: e instanceof Error ? e.message : String(e) }
  }
}

export async function startSignIn(): Promise<SageAuthState> {
  if (pending) pending.cancelled = true
  const ticket = { cancelled: false }
  pending = ticket
  const start = await sageRequestPublic<{ device_code: string; user_code: string; verification_url: string; expires_in: number; interval: number }>(
    '/v1/auth/device/start', { client: 'desktop', device_name: `SAGE Desktop · ${hostname().replace(/\.local$/, '')}`.slice(0, 80) })
  await shell.openExternal(start.verification_url)
  const waiting: SageAuthState = { status: 'waiting', userCode: start.user_code, verificationUrl: start.verification_url }
  void poll(ticket, start.device_code, start.interval, Date.now() + start.expires_in * 1000)
  return waiting
}

async function poll(ticket: { cancelled: boolean }, deviceCode: string, interval: number, deadline: number): Promise<void> {
  while (!ticket.cancelled && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, Math.max(2, interval) * 1000))
    if (ticket.cancelled) return
    try {
      const r = await sageRequestPublic<{ status: string; access_token?: string }>('/v1/auth/device/token', { device_code: deviceCode })
      if (r.status === 'approved' && r.access_token) {
        setSecret(TOKEN_SECRET, r.access_token)
        pending = null
        authEvents.emit(await authStatus())
        return
      }
      if (r.status === 'denied' || r.status === 'expired' || r.status === 'consumed') {
        pending = null
        authEvents.emit({ status: 'signed_out', reason: r.status === 'denied' ? 'Sign-in was denied in the browser.' : 'The sign-in code expired. Please try again.' })
        return
      }
    } catch {
      /* transient network error — keep polling until the deadline */
    }
  }
  if (!ticket.cancelled) authEvents.emit({ status: 'signed_out', reason: 'The sign-in code expired. Please try again.' })
}

export function cancelSignIn(): SageAuthState {
  if (pending) pending.cancelled = true
  pending = null
  return { status: 'signed_out' }
}

export async function signOut(): Promise<SageAuthState> {
  try {
    if (sessionToken()) await sageRequest('POST', '/v1/auth/logout', {}, 10_000)
  } catch {
    /* revoke best-effort; local token is removed regardless */
  }
  deleteSecret(TOKEN_SECRET)
  return { status: 'signed_out' }
}

async function sageRequestPublic<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${apiBase()}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000)
  })
  const data = (await resp.json().catch(() => ({}))) as T & { error?: { message?: string; code?: string } }
  if (!resp.ok) throw new SageApiError(data.error?.message || `HTTP ${resp.status}`, resp.status, data.error?.code || 'http_error')
  return data
}
