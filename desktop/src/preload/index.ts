import { contextBridge, ipcRenderer } from 'electron'
import type {
  Application,
  AppSettings,
  AutaApi,
  Checkpoint,
  CheckpointResolution,
  Profile,
  ProviderConfig,
  ProviderId,
  ProviderModel,
  SiteCredentialInput,
  StepEvent
} from '@shared/types'
import type { SageApi, SageAuthState } from '@shared/sage'

const api: AutaApi = {
  uploadResume: (bytes, name) => ipcRenderer.invoke('uploadResume', bytes, name),
  extractProfile: (text) => ipcRenderer.invoke('extractProfile', text),
  getProfile: () => ipcRenderer.invoke('getProfile'),
  saveProfile: (p: Profile) => ipcRenderer.invoke('saveProfile', p),

  addJob: (url) => ipcRenderer.invoke('addJob', url),
  listJobs: () => ipcRenderer.invoke('listJobs'),
  listApplications: () => ipcRenderer.invoke('listApplications'),
  listApplicationEvents: (applicationId) => ipcRenderer.invoke('listApplicationEvents', applicationId),
  startApply: (jobId) => ipcRenderer.invoke('startApply', jobId),
  startApplyAll: () => ipcRenderer.invoke('startApplyAll'),
  cancelApply: (id) => ipcRenderer.invoke('cancelApply', id),
  removeApplication: (id) => ipcRenderer.invoke('removeApplication', id),
  clearInactiveApplications: () => ipcRenderer.invoke('clearInactiveApplications'),
  resolveCheckpoint: (id, res: CheckpointResolution) => ipcRenderer.invoke('resolveCheckpoint', id, res),

  getSettings: () => ipcRenderer.invoke('getSettings'),
  saveSettings: (s: AppSettings) => ipcRenderer.invoke('saveSettings', s),
  listProviders: () => ipcRenderer.invoke('listProviders'),
  listProviderModels: (id: ProviderId): Promise<ProviderModel[]> => ipcRenderer.invoke('listProviderModels', id),
  setProviderKey: (id: ProviderId, key: string) => ipcRenderer.invoke('setProviderKey', id, key),
  setProviderConfig: (id: ProviderId, cfg: Partial<ProviderConfig>) =>
    ipcRenderer.invoke('setProviderConfig', id, cfg),
  testProvider: (id: ProviderId) => ipcRenderer.invoke('testProvider', id),
  getSkyvernStatus: () => ipcRenderer.invoke('getSkyvernStatus'),
  setSkyvernKey: (key: string) => ipcRenderer.invoke('setSkyvernKey', key),
  testSkyvern: () => ipcRenderer.invoke('testSkyvern'),

  listSiteCredentials: () => ipcRenderer.invoke('listSiteCredentials'),
  saveSiteCredential: (input: SiteCredentialInput) => ipcRenderer.invoke('saveSiteCredential', input),
  deleteSiteCredential: (id: string) => ipcRenderer.invoke('deleteSiteCredential', id),

  gmailStatus: () => ipcRenderer.invoke('gmailStatus'),
  gmailSetClient: (clientId: string, clientSecret: string) =>
    ipcRenderer.invoke('gmailSetClient', clientId, clientSecret),
  gmailConnect: () => ipcRenderer.invoke('gmailConnect'),
  gmailDisconnect: () => ipcRenderer.invoke('gmailDisconnect'),
  gmailFindLatestOtp: () => ipcRenderer.invoke('gmailFindLatestOtp'),

  browserIdentityStatus: () => ipcRenderer.invoke('browserIdentityStatus'),
  browserIdentityStart: () => ipcRenderer.invoke('browserIdentityStart'),
  browserIdentityComplete: () => ipcRenderer.invoke('browserIdentityComplete'),
  browserIdentityCancel: () => ipcRenderer.invoke('browserIdentityCancel'),
  browserIdentityDisconnect: () => ipcRenderer.invoke('browserIdentityDisconnect'),

  wipeAllData: () => ipcRenderer.invoke('wipeAllData'),

  onStep: (cb: (e: StepEvent) => void) => {
    const l = (_: unknown, e: StepEvent) => cb(e)
    ipcRenderer.on('evt:step', l)
    return () => ipcRenderer.removeListener('evt:step', l)
  },
  onCheckpoint: (cb: (c: Checkpoint) => void) => {
    const l = (_: unknown, c: Checkpoint) => cb(c)
    ipcRenderer.on('evt:checkpoint', l)
    return () => ipcRenderer.removeListener('evt:checkpoint', l)
  },
  onApplicationUpdate: (cb: (a: Application) => void) => {
    const l = (_: unknown, a: Application) => cb(a)
    ipcRenderer.on('evt:application', l)
    return () => ipcRenderer.removeListener('evt:application', l)
  }
}

contextBridge.exposeInMainWorld('auta', api)

async function unwrap<T>(p: Promise<{ ok: boolean; data?: T; error?: { message: string; status: number; code: string } }>): Promise<T> {
  const r = await p
  if (r.ok) return r.data as T
  const err = Object.assign(new Error(r.error?.message || 'Request failed'), r.error)
  throw err
}

const sage: SageApi = {
  importReport: () => unwrap(ipcRenderer.invoke('sage:importReport')),
  authStatus: () => unwrap(ipcRenderer.invoke('sage:authStatus')),
  signIn: () => unwrap(ipcRenderer.invoke('sage:signIn')),
  cancelSignIn: () => unwrap(ipcRenderer.invoke('sage:cancelSignIn')),
  signOut: () => unwrap(ipcRenderer.invoke('sage:signOut')),
  onAuth: (cb: (s: SageAuthState) => void) => {
    const l = (_: unknown, s: SageAuthState) => cb(s)
    ipcRenderer.on('evt:sage-auth', l)
    return () => ipcRenderer.removeListener('evt:sage-auth', l)
  },
  request: (method, path, body) => unwrap(ipcRenderer.invoke('sage:request', method, path, body)),
  openExternal: (url) => unwrap(ipcRenderer.invoke('sage:openExternal', url)),
  apiBase: () => unwrap(ipcRenderer.invoke('sage:apiBase'))
}

contextBridge.exposeInMainWorld('sage', sage)
