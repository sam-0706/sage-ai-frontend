import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { dataDir } from '../store/paths'
import { ipcMain, shell, type BrowserWindow } from 'electron'
import { apiBase, authEvents, authStatus, cancelSignIn, sageRequest, SageApiError, signOut, startSignIn } from './client'

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { message: string; status: number; code: string; details?: unknown } }

async function wrap<T>(fn: () => Promise<T>): Promise<Envelope<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    if (e instanceof SageApiError) return { ok: false, error: { message: e.message, status: e.status, code: e.code, details: e.details } }
    return { ok: false, error: { message: e instanceof Error ? e.message : String(e), status: 0, code: 'client_error' } }
  }
}

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

export function registerSageIpc(getWindow: () => BrowserWindow | null): void {
  authEvents.on((s) => getWindow()?.webContents.send('evt:sage-auth', s))
  ipcMain.handle('sage:importReport', () => wrap(async () => { const p = join(dataDir(), 'auta-import.json'); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null }))
  ipcMain.handle('sage:authStatus', () => wrap(authStatus))
  ipcMain.handle('sage:signIn', () => wrap(startSignIn))
  ipcMain.handle('sage:cancelSignIn', () => wrap(async () => cancelSignIn()))
  ipcMain.handle('sage:signOut', () => wrap(signOut))
  ipcMain.handle('sage:apiBase', () => wrap(async () => apiBase()))
  ipcMain.handle('sage:request', (_e, method: string, path: string, body?: unknown) =>
    wrap(async () => {
      if (!ALLOWED_METHODS.has(method)) throw new SageApiError('Method not allowed', 400, 'invalid_method')
      return sageRequest(method, path, body)
    })
  )
  ipcMain.handle('sage:openExternal', (_e, url: string) =>
    wrap(async () => {
      const u = new URL(url)
      if (!['https:', 'http:'].includes(u.protocol)) throw new SageApiError('Only web links can be opened', 400, 'invalid_url')
      await shell.openExternal(u.toString())
    })
  )
}
