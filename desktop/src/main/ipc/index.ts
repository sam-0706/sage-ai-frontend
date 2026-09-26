import { ipcMain, type BrowserWindow } from 'electron'
import type {
  AppSettings,
  CheckpointResolution,
  Profile,
  ProviderConfig,
  ProviderId,
  SiteCredentialInput
} from '@shared/types'
import * as store from '../store/db'
import { parseResume } from '../resume/parse'
import { extractProfile } from '../resume/extract'
import { enrichJob } from '../ats/enrich'
import { setSecret, hasSecret, secretName } from '../secrets/keychain'
import { getProviderConfigs, setProviderConfig } from '../store/db'
import { listProviderModels, testProvider } from '../providers'
import { Orchestrator } from '../orchestrator'
import { wipeSecrets } from '../secrets/keychain'
import {
  gmailStatus,
  gmailConnect,
  gmailDisconnect,
  setGmailClient,
  findLatestOtp
} from '../gmail'
import { browserIdentity } from '../browserIdentity'
import { sessionToken } from '../sage/client'
import { deleteSiteCredential, listSiteCredentials, saveSiteCredential } from '../auth/credentials'
import { skyvernStatus, testSkyvernConnection } from '../engine/skyvern'

let activeWindow: BrowserWindow | null = null
let sharedOrchestrator: Orchestrator | null = null

export function registerIpc(win: BrowserWindow): Orchestrator {
  activeWindow = win
  if (sharedOrchestrator) return sharedOrchestrator

  const orchestrator = new Orchestrator({
    step: (e) => activeWindow?.webContents.send('evt:step', e),
    checkpoint: (c) => activeWindow?.webContents.send('evt:checkpoint', c),
    application: (a) => activeWindow?.webContents.send('evt:application', a)
  })
  sharedOrchestrator = orchestrator

  const h = (channel: string, fn: (...args: any[]) => any) =>
    ipcMain.handle(channel, (_e, ...args) => fn(...args))

  // resume + profile
  h('uploadResume', async (bytes: ArrayBuffer, name: string) => {
    const { text, savedPath } = await parseResume(Buffer.from(bytes), name)
    store.setResumePath(savedPath)
    return { text }
  })
  h('extractProfile', (text: string) => extractProfile(text))
  h('getProfile', () => store.getProfile())
  h('saveProfile', (p: Profile) => store.saveProfile(p))

  // jobs + applications
  h('addJob', async (url: string) => {
    const meta = await enrichJob(url)
    return store.addJob(meta)
  })
  h('listJobs', () => store.listJobs())
  h('listApplications', () => store.listApplications())
  h('listApplicationEvents', (applicationId: string) => store.listApplicationEvents(applicationId))
  h('startApply', (jobId: string) => orchestrator.startApply(jobId))
  h('startApplyAll', () => orchestrator.startApplyAll())
  h('cancelApply', (applicationId: string) => orchestrator.cancel(applicationId))
  h('removeApplication', (applicationId: string) => {
    orchestrator.cancel(applicationId)
    store.removeApplication(applicationId)
  })
  h('clearInactiveApplications', () => store.clearInactiveApplications())
  h('resolveCheckpoint', (checkpointId: string, res: CheckpointResolution) =>
    orchestrator.resolveCheckpoint(checkpointId, res)
  )

  // settings + providers
  h('getSettings', () => store.getSettings())
  h('saveSettings', (s: AppSettings) => store.saveSettings(s))
  h('listProviders', () =>
    getProviderConfigs().map((c) => ({ ...c, hasKey: c.id === 'sage' ? !!sessionToken() || !!process.env.SAGE_DEV_EMAIL : hasSecret(secretName.providerKey(c.id)) }))
  )
  h('listProviderModels', (id: ProviderId) => listProviderModels(id))
  h('setProviderKey', (id: ProviderId, key: string) => setSecret(secretName.providerKey(id), key.trim()))
  h('setProviderConfig', (id: ProviderId, cfg: Partial<ProviderConfig>) => setProviderConfig(id, cfg))
  h('testProvider', (id: ProviderId) => testProvider(id))
  h('getSkyvernStatus', () => skyvernStatus())
  h('setSkyvernKey', (key: string) => setSecret(secretName.skyvernApiKey(), key.trim()))
  h('testSkyvern', () => testSkyvernConnection(store.getSettings()))

  // credential broker — only safe metadata is ever returned to the renderer
  h('listSiteCredentials', () => listSiteCredentials())
  h('saveSiteCredential', (input: SiteCredentialInput) => saveSiteCredential(input))
  h('deleteSiteCredential', (id: string) => deleteSiteCredential(id))

  // gmail
  h('gmailStatus', () => gmailStatus())
  h('gmailSetClient', (clientId: string, clientSecret: string) => setGmailClient(clientId, clientSecret))
  h('gmailConnect', () => gmailConnect())
  h('gmailDisconnect', () => gmailDisconnect())
  h('gmailFindLatestOtp', () => findLatestOtp())

  // browser identity — user authorizes in the visible Playwright profile
  h('browserIdentityStatus', () => browserIdentity.status())
  h('browserIdentityStart', () => browserIdentity.start())
  h('browserIdentityComplete', () => browserIdentity.complete())
  h('browserIdentityCancel', () => browserIdentity.cancel())
  h('browserIdentityDisconnect', () => browserIdentity.disconnect())

  // data
  h('wipeAllData', async () => {
    await browserIdentity.disconnect()
    store.wipeAll()
    wipeSecrets()
  })

  return orchestrator
}
