import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  Application,
  AppSettings,
  BrowserIdentityStatus,
  Checkpoint,
  GmailStatus,
  Job,
  ProviderConfig,
  StepEvent
} from '@shared/types'

type AppRow = Application & { job: Job }

interface AutaState {
  ready: boolean
  hasProfile: boolean
  applications: AppRow[]
  checkpoints: Checkpoint[]
  liveSteps: Record<string, StepEvent[]>
  latestShot: Record<string, string> // applicationId -> data url
  settings: AppSettings | null
  providers: ProviderConfig[]
  gmail: GmailStatus
  browserIdentity: BrowserIdentityStatus
  refresh: () => Promise<void>
  refreshProfile: () => Promise<void>
  refreshSettings: () => Promise<void>
  dismissCheckpoint: (id: string) => void
}

const Ctx = createContext<AutaState | null>(null)

export function AutaProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [hasProfile, setHasProfile] = useState(false)
  const [applications, setApplications] = useState<AppRow[]>([])
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [liveSteps, setLiveSteps] = useState<Record<string, StepEvent[]>>({})
  const [latestShot, setLatestShot] = useState<Record<string, string>>({})
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [gmail, setGmail] = useState<GmailStatus>({ connected: false, clientConfigured: false })
  const [browserIdentity, setBrowserIdentity] = useState<BrowserIdentityStatus>({
    ready: false,
    sessionOpen: false
  })
  const stepBuf = useRef<Record<string, StepEvent[]>>({})

  const refresh = async () => {
    const [apps, provs, g, identity] = await Promise.all([
      window.auta.listApplications(),
      window.auta.listProviders(),
      window.auta.gmailStatus(),
      window.auta.browserIdentityStatus()
    ])
    setApplications(apps)
    setProviders(provs)
    setGmail(g)
    setBrowserIdentity(identity)
  }
  const refreshProfile = async () => setHasProfile(!!(await window.auta.getProfile()))
  const refreshSettings = async () => setSettings(await window.auta.getSettings())

  useEffect(() => {
    ;(async () => {
      await Promise.allSettled([refresh(), refreshProfile(), refreshSettings()])
      setReady(true)
    })()

    const offStep = window.auta.onStep((e) => {
      const buf = stepBuf.current[e.applicationId] ?? []
      const next = [...buf, e].slice(-60)
      stepBuf.current[e.applicationId] = next
      setLiveSteps({ ...stepBuf.current })
      if (e.screenshot) setLatestShot((s) => ({ ...s, [e.applicationId]: e.screenshot! }))
    })
    const offCp = window.auta.onCheckpoint((c) => {
      setCheckpoints((cs) => [...cs.filter((x) => x.id !== c.id), c])
    })
    const offApp = window.auta.onApplicationUpdate((a) => {
      setApplications((apps) => apps.map((x) => (x.id === a.id ? { ...x, ...a } : x)))
      if (a.status !== 'paused_checkpoint') {
        setCheckpoints((items) => items.filter((checkpoint) => checkpoint.applicationId !== a.id))
      }
      // when an application changes, also do a light refresh to pick up new rows
      if (a.status === 'submitted' || a.status === 'failed' || a.status === 'skipped') void refresh()
    })
    return () => {
      offStep()
      offCp()
      offApp()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const preference = settings?.appearance ?? 'system'
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference
      document.documentElement.dataset.theme = resolved
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings?.appearance])

  const dismissCheckpoint = (id: string) => setCheckpoints((cs) => cs.filter((c) => c.id !== id))

  return (
    <Ctx.Provider
      value={{
        ready,
        hasProfile,
        applications,
        checkpoints,
        liveSteps,
        latestShot,
        settings,
        providers,
        gmail,
        browserIdentity,
        refresh,
        refreshProfile,
        refreshSettings,
        dismissCheckpoint
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAuta(): AutaState {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuta must be used within AutaProvider')
  return c
}
