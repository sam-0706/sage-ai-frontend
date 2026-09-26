import { useEffect, useState } from 'react'
import type {
  AppSettings,
  CredentialLoginMethod,
  ProviderConfig,
  ProviderId,
  ProviderModel,
  ProviderTask,
  SiteCredential,
  SkyvernRunEngine,
  SkyvernStatus
} from '@shared/types'
import { useAuta } from '@/state'
import { Badge, Button, Card, Field, Input, Spinner, Switch } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Check, KeyRound, Mail, Trash2, TriangleAlert, Cpu, Monitor, Sun, Moon, Chrome, ShieldCheck, X, RefreshCw, LockKeyhole, Plus } from 'lucide-react'

const TASKS: { id: ProviderTask; label: string; hint: string }[] = [
  { id: 'loop', label: 'Form-filling agent', hint: 'Drives the browser' },
  { id: 'extract', label: 'Resume extraction', hint: 'Parses your resume' },
  { id: 'tailor', label: 'Resume tailoring', hint: 'Per-job rewrite' },
  { id: 'answer', label: 'Screening answers', hint: 'Answers questions' }
]

export function Settings() {
  const { providers, settings, refresh, refreshSettings, gmail, browserIdentity } = useAuta()
  const [local, setLocal] = useState<AppSettings | null>(settings)
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState<string>('')
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [skyvernKey, setSkyvernKey] = useState('')
  const [skyvernTesting, setSkyvernTesting] = useState(false)
  const [skyvernStatus, setSkyvernStatus] = useState<SkyvernStatus>({ hasKey: false, message: '' })
  const openRouterReady = providers.some((provider) => provider.id === 'openrouter' && provider.hasKey)
  const openRouterVisionActive = local?.automationEngine === 'builtin' && local.taskProviders.loop === 'openrouter'

  useEffect(() => setLocal(settings), [settings])
  useEffect(() => {
    let active = true
    window.auta.getSkyvernStatus().then((status) => { if (active) setSkyvernStatus(status) }).catch(() => {})
    return () => { active = false }
  }, [])
  if (!local) return null

  const saveSettings = async (next: AppSettings) => {
    setLocal(next)
    await window.auta.saveSettings(next)
    await refreshSettings()
  }

  const saveKey = async (id: ProviderId) => {
    if (keys[id] == null) return
    await window.auta.setProviderKey(id, keys[id])
    setKeys((k) => ({ ...k, [id]: '' }))
    await refresh()
  }

  const saveModel = async (id: ProviderId, model: string) => {
    await window.auta.setProviderConfig(id, { model })
    await refresh()
  }

  const test = async (id: ProviderId) => {
    setTesting(id)
    const r = await window.auta.testProvider(id)
    setTestResult((t) => ({ ...t, [id]: r }))
    setTesting('')
  }

  const saveAndTestSkyvern = async () => {
    setSkyvernTesting(true)
    try {
      if (skyvernKey.trim()) {
        await window.auta.setSkyvernKey(skyvernKey.trim())
        setSkyvernKey('')
      }
      setSkyvernStatus(await window.auta.testSkyvern())
    } catch (error) {
      setSkyvernStatus({ hasKey: false, ok: false, message: cleanIpcError(error) })
    } finally {
      setSkyvernTesting(false)
    }
  }

  const activateOpenRouterVision = async () => {
    await window.auta.setProviderConfig('openrouter', { model: '~openai/gpt-latest' })
    await saveSettings({
      ...local,
      automationEngine: 'builtin',
      taskProviders: { ...local.taskProviders, loop: 'openrouter' }
    })
    await refresh()
  }

  return (
    <div className="h-full overflow-y-auto px-8 pb-12 pt-12">
      <div className="mx-auto max-w-4xl">
      <div className="mb-7">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> CONTROL ROOM</div>
        <h1 className="font-display text-[2rem] font-bold tracking-[-0.04em]">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Accounts, providers, behavior, and privacy under your local control.</p>
      </div>

      <Card className="mb-4 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold"><Monitor className="h-4 w-4 text-primary" /> Appearance</h2>
        <div className="grid grid-cols-3 gap-2 rounded-[var(--radius-input)] bg-background p-1.5">
          {([
            ['system', 'System', Monitor],
            ['dark', 'Dark', Moon],
            ['light', 'Light', Sun]
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => saveSettings({ ...local, appearance: id })} className={cn('flex h-9 items-center justify-center gap-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', local.appearance === id ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="mb-4 p-5">
        <div className="mb-1 flex items-center gap-2">
          <Chrome className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold">Browser automation engine</h2>
          <Badge tone={local.automationEngine === 'skyvern' ? 'primary' : 'success'} className="ml-auto">
            {local.automationEngine === 'skyvern' ? 'Skyvern selected' : openRouterVisionActive ? 'OpenRouter vision active' : 'Local browser selected'}
          </Badge>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          The built-in engine uses SAGE’s local signed-in browser. Skyvern uses a separate cloud or self-hosted browser and its vision-based agent.
        </p>
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-[var(--radius-input)] bg-background p-1.5">
          <button
            onClick={() => saveSettings({ ...local, automationEngine: 'builtin' })}
            className={cn('h-10 rounded-md text-xs font-semibold transition-colors', local.automationEngine === 'builtin' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            Built-in Playwright
          </button>
          <button
            onClick={() => saveSettings({ ...local, automationEngine: 'skyvern' })}
            className={cn('h-10 rounded-md text-xs font-semibold transition-colors', local.automationEngine === 'skyvern' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            Skyvern agent
          </button>
        </div>
        <div className="mb-4 flex items-center gap-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold">Use your own OpenRouter key with SAGE’s local browser</div>
            <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              Uses OpenRouter’s latest OpenAI vision model to analyze screenshots while local Playwright executes clicks and preserves your existing LinkedIn/Google sessions. This is not OpenAI’s hosted CUA endpoint.
            </div>
          </div>
          <Button
            size="sm"
            variant={openRouterVisionActive ? 'subtle' : 'outline'}
            className="ml-auto shrink-0"
            disabled={!openRouterReady || openRouterVisionActive}
            onClick={() => void activateOpenRouterVision()}
          >
            {openRouterVisionActive ? 'Active' : openRouterReady ? 'Activate' : 'Add OpenRouter key first'}
          </Button>
        </div>
        {local.automationEngine === 'skyvern' && (
          <div className="space-y-3 rounded-xl bg-background/55 p-4 shadow-[inset_0_0_0_1px_oklch(var(--border)/0.65)]">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Skyvern API URL" hint="Cloud or self-hosted root URL">
                <Input
                  value={local.skyvernBaseUrl}
                  onChange={(event) => setLocal({ ...local, skyvernBaseUrl: event.target.value })}
                  onBlur={() => void saveSettings(local)}
                  placeholder="https://api.skyvern.com"
                />
              </Field>
              <Field label="Agent engine">
                <select
                  value={local.skyvernRunEngine}
                  onChange={(event) => saveSettings({ ...local, skyvernRunEngine: event.target.value as SkyvernRunEngine })}
                  className="h-10 w-full rounded-[var(--radius-input)] bg-background px-3 text-sm shadow-[inset_0_0_0_1px_oklch(var(--input))] no-drag focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="skyvern-2.0">Skyvern 2.0 (recommended)</option>
                  <option value="skyvern-1.0">Skyvern 1.0</option>
                  <option value="openai-cua">OpenAI CUA</option>
                  <option value="anthropic-cua">Anthropic CUA</option>
                  <option value="ui-tars">UI-TARS</option>
                </select>
              </Field>
              <Field label="Skyvern service API key" hint={skyvernStatus.hasKey ? 'Encrypted Skyvern key already stored' : 'A Skyvern key is required; an OpenRouter key cannot authenticate this service'}>
                <Input type="password" value={skyvernKey} onChange={(event) => setSkyvernKey(event.target.value)} placeholder={skyvernStatus.hasKey ? '•••••••• (set)' : 'Paste key'} />
              </Field>
              <Field label="Persistent browser session ID" hint="Optional; use a Skyvern pbs_ session for saved logins">
                <Input
                  value={local.skyvernBrowserSessionId}
                  onChange={(event) => setLocal({ ...local, skyvernBrowserSessionId: event.target.value })}
                  onBlur={() => void saveSettings(local)}
                  placeholder="pbs_…"
                />
              </Field>
              <Field label="Maximum agent steps" hint="Skyvern charges by usage; 10–200">
                <Input
                  type="number"
                  min={10}
                  max={200}
                  value={local.skyvernMaxSteps}
                  onChange={(event) => setLocal({ ...local, skyvernMaxSteps: Math.max(10, Math.min(200, Number(event.target.value) || 10)) })}
                  onBlur={() => void saveSettings(local)}
                />
              </Field>
              <div className="flex items-end gap-3 pb-0.5">
                <Button onClick={() => void saveAndTestSkyvern()} loading={skyvernTesting} disabled={!skyvernKey.trim() && !skyvernStatus.hasKey}>
                  <RefreshCw className="h-4 w-4" /> Save & test
                </Button>
                {skyvernStatus.message && (
                  <span className={cn('text-xs leading-4', skyvernStatus.ok === false ? 'text-destructive' : skyvernStatus.ok ? 'text-success' : 'text-muted-foreground')}>
                    {skyvernStatus.message}{!skyvernStatus.hasKey ? ' New applications will use built-in Playwright until a key is stored.' : ''}
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
              Skyvern cannot inherit SAGE’s local LinkedIn/Google cookies. Configure a persistent Skyvern browser session for signed-in jobs. Resume and candidate facts are sent to the selected Skyvern service only when this engine runs; local password values are never sent.
            </div>
          </div>
        )}
      </Card>

      {/* Task routing */}
      <Card className="mb-4 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
          <Cpu className="h-4 w-4" /> Model per task
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {TASKS.map((t) => (
            <Field key={t.id} label={t.label} hint={t.hint}>
              <select
                className="h-10 w-full rounded-[var(--radius-input)] bg-background px-3 text-sm shadow-[inset_0_0_0_1px_oklch(var(--input))] no-drag focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={local.taskProviders[t.id]}
                onChange={(e) => saveSettings({ ...local, taskProviders: { ...local.taskProviders, [t.id]: e.target.value as ProviderId } })}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
          The form-filling agent sends the current rendered application screenshot plus redacted DOM/profile context to the selected provider. Choose a model marked “vision” for visual page understanding; password values are never included.
        </p>
      </Card>

      {/* Providers */}
      <Card className="mb-4 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
          <KeyRound className="h-4 w-4" /> Providers & keys
        </h2>
        <div className="space-y-4">
          {providers.map((p) => (
            <ProviderRow
              key={p.id}
              p={p}
              keyValue={keys[p.id] ?? ''}
              onKeyChange={(v) => setKeys((k) => ({ ...k, [p.id]: v }))}
              onSaveKey={() => saveKey(p.id)}
              onSaveModel={(m) => saveModel(p.id, m)}
              isLoopProvider={local.taskProviders.loop === p.id}
              onUseForLoop={() => saveSettings({
                ...local,
                taskProviders: { ...local.taskProviders, loop: p.id }
              })}
              onTest={() => test(p.id)}
              testing={testing === p.id}
              result={testResult[p.id]}
            />
          ))}
        </div>
      </Card>

      {/* Behavior */}
      <Card className="mb-4 p-5">
        <h2 className="mb-4 text-sm font-bold">Application behavior</h2>
        <Row
          title="Auto-submit"
          desc="Skip the final-submit checkpoint. Even ON, it never auto-clicks through a CAPTCHA or sign-in gate."
          warn
        >
          <Switch label="Auto-submit applications" checked={local.autoSubmit} onChange={(v) => saveSettings({ ...local, autoSubmit: v })} />
        </Row>
        <Row title="Visible automation browser" desc="Always visible so protected CAPTCHA, consent, and sign-in steps are clear when a site requires them.">
          <Badge tone="success"><Check className="h-3 w-3" /> Takeover ready</Badge>
        </Row>
        <Row title="Reuse signed-in browser" desc="Use the browser identity you authorized for Google and job-site sessions.">
          <Switch label="Reuse signed-in browser" checked={local.reuseBrowserSession} onChange={(v) => saveSettings({ ...local, reuseBrowserSession: v })} />
        </Row>
        <Row title="Prefer Google sign-in" desc="When no site password is saved and Google is offered, try the existing authorized browser session.">
          <Switch label="Prefer Google sign-in" checked={local.preferGoogleSignIn} onChange={(v) => saveSettings({ ...local, preferGoogleSignIn: v })} />
        </Row>
        <Row
          title="Automatic account creation"
          desc="If no login exists, generate and securely store a unique site password. Terms, CAPTCHA, consent, and OTP screens still pause for review."
          warn
        >
          <Switch label="Automatic account creation" checked={local.autoCreateAccounts} onChange={(v) => saveSettings({ ...local, autoCreateAccounts: v })} />
        </Row>
        <Row title={`Answer confidence: ${Math.round(local.minConfidence * 100)}%`} desc="Below this, screening questions pause for you.">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={local.minConfidence}
            onChange={(e) => saveSettings({ ...local, minConfidence: Number(e.target.value) })}
            className="w-40 no-drag accent-primary"
          />
        </Row>
      </Card>

      <BrowserIdentityCard status={browserIdentity} onChanged={refresh} />

      <CredentialManagerCard />

      {/* Gmail */}
      <GmailCard connected={gmail.connected} email={gmail.email} onChanged={refresh} />

      {/* Danger */}
      <Card className="mb-8 border-destructive/30 p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-destructive">
          <TriangleAlert className="h-4 w-4" /> Danger zone
        </h2>
        <Row title="Wipe all data" desc="Delete profile, jobs, applications, keys, and Gmail token from this machine.">
          <Button
            variant="destructive"
            onClick={async () => {
              if (!window.confirm('Permanently wipe your profile, jobs, applications, keys, browser session, and Gmail token?')) return
              await window.auta.wipeAllData()
              location.reload()
            }}
          >
            <Trash2 className="h-4 w-4" /> Wipe
          </Button>
        </Row>
      </Card>
      </div>
    </div>
  )
}

function ProviderRow({
  p,
  keyValue,
  onKeyChange,
  onSaveKey,
  onSaveModel,
  isLoopProvider,
  onUseForLoop,
  onTest,
  testing,
  result
}: {
  p: ProviderConfig
  keyValue: string
  onKeyChange: (v: string) => void
  onSaveKey: () => Promise<void>
  onSaveModel: (m: string) => Promise<void>
  isLoopProvider: boolean
  onUseForLoop: () => Promise<void>
  onTest: () => void
  testing: boolean
  result?: { ok: boolean; message: string }
}) {
  const [model, setModel] = useState(p.model ?? '')
  const [models, setModels] = useState<ProviderModel[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelError, setModelError] = useState('')
  useEffect(() => setModel(p.model ?? ''), [p.model])
  const needsKey = p.id !== 'claude-code' && p.id !== 'ollama'
  const canLoadModels = Boolean(p.supportsModelListing && (!needsKey || p.hasKey))

  const loadModels = async () => {
    if (!canLoadModels) return
    setLoadingModels(true)
    setModelError('')
    try {
      setModels(await window.auta.listProviderModels(p.id))
    } catch (e) {
      setModelError(modelLoadError(e, p))
    } finally {
      setLoadingModels(false)
    }
  }

  useEffect(() => {
    let active = true
    if (!canLoadModels) {
      setModels([])
      setModelError('')
      return () => { active = false }
    }
    setLoadingModels(true)
    setModelError('')
    window.auta.listProviderModels(p.id)
      .then((next) => { if (active) setModels(next) })
      .catch((e: unknown) => { if (active) setModelError(modelLoadError(e, p)) })
      .finally(() => { if (active) setLoadingModels(false) })
    return () => { active = false }
  }, [p.id, p.hasKey, canLoadModels])

  const modelOptions = model && !models.some((option) => option.id === model)
    ? [{ id: model, label: models.length ? `${model} (currently selected)` : model }, ...models]
    : models

  const saveKeyAndReload = async () => {
    await onSaveKey()
    setLoadingModels(true)
    setModelError('')
    try {
      setModels(await window.auta.listProviderModels(p.id))
      if (p.id === 'openrouter') {
        const validation = await window.auta.testProvider(p.id)
        if (!validation.ok) {
          throw new Error(`Key saved, but OpenRouter could not run the selected model: ${validation.message}`)
        }
        await onUseForLoop()
      }
    } catch (e) {
      setModelError(modelLoadError(e, p))
    } finally {
      setLoadingModels(false)
    }
  }

  return (
    <div className="rounded-xl bg-background/55 p-4 shadow-[inset_0_0_0_1px_oklch(var(--border)/0.65)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-medium">{p.label}</span>
        {p.id === 'claude-code' && <Badge tone="primary">local CLI</Badge>}
        {p.id === 'openrouter' && <Badge tone="primary">recommended agent</Badge>}
        {p.id === 'together' && <Badge tone="primary">OpenAI compatible</Badge>}
        {needsKey && (p.hasKey ? <Badge tone="success">key set</Badge> : <Badge tone="muted">no key</Badge>)}
        <div className="ml-auto flex items-center gap-2">
          {p.id === 'openrouter' && (
            <Button
              size="sm"
              variant={isLoopProvider ? 'subtle' : 'ghost'}
              disabled={!p.hasKey || isLoopProvider}
              onClick={() => void onUseForLoop()}
            >
              {isLoopProvider ? 'Browser agent active' : 'Use for browser agent'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onTest} disabled={testing}>
            {testing ? <Spinner /> : 'Test'}
          </Button>
          {result && (
            <span className={result.ok ? 'text-xs text-success' : 'text-xs text-destructive'}>
              {result.ok ? '✓ ' : '✗ '}
              {result.message.slice(0, 40)}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
        <Field
          label="Model"
          hint={p.supportsModelListing && needsKey && !p.hasKey ? 'Save a key to load live models' : undefined}
        >
          <div className="flex gap-1.5">
            <select
              aria-label={`${p.label} model`}
              className="h-10 min-w-0 flex-1 rounded-[var(--radius-input)] bg-background px-3 text-sm shadow-[inset_0_0_0_1px_oklch(var(--input))] no-drag focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              value={model}
              disabled={!modelOptions.length || loadingModels}
              onChange={(e) => {
                const next = e.target.value
                setModel(next)
                void onSaveModel(next)
              }}
            >
              {!modelOptions.length && <option value="">{loadingModels ? 'Loading live models…' : 'No models available'}</option>}
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            {p.supportsModelListing && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Refresh ${p.label} models`}
                title="Refresh live models"
                disabled={!canLoadModels || loadingModels}
                onClick={() => void loadModels()}
                className="h-10 w-10 shrink-0 px-0"
              >
                {loadingModels ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
          {modelError && <p className="mt-1 text-[11px] leading-4 text-destructive">{modelError.slice(0, 180)}</p>}
        </Field>
        {needsKey ? (
          <Field label="API key">
            <Input
              type="password"
              placeholder={p.hasKey ? '•••••••• (set)' : 'Paste key'}
              value={keyValue}
              onChange={(e) => onKeyChange(e.target.value)}
            />
          </Field>
        ) : p.id === 'claude-code' ? (
          <div className="text-xs text-muted-foreground">Uses your local <code>claude</code> CLI login.</div>
        ) : (
          <div className="text-xs text-muted-foreground">Reads models from the Ollama service running on this Mac.</div>
        )}
        {needsKey && (
          <Button variant="subtle" onClick={() => void saveKeyAndReload()} disabled={!keyValue || loadingModels}>
            Save key
          </Button>
        )}
      </div>
    </div>
  )
}

function modelLoadError(error: unknown, provider: ProviderConfig): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (provider.id === 'ollama' && /fetch failed|ECONNREFUSED/i.test(raw)) {
    return 'Ollama is not reachable. Start Ollama, then refresh the model list.'
  }
  return raw
    .replace(/^Error invoking remote method 'listProviderModels':\s*/i, '')
    .replace(/^Error:\s*/i, '')
}

function CredentialManagerCard() {
  const [credentials, setCredentials] = useState<SiteCredential[]>([])
  const [siteUrl, setSiteUrl] = useState('')
  const [email, setEmail] = useState('')
  const [method, setMethod] = useState<CredentialLoginMethod>('password')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const reload = async () => setCredentials(await window.auta.listSiteCredentials())

  useEffect(() => {
    let active = true
    Promise.all([window.auta.listSiteCredentials(), window.auta.getProfile()])
      .then(([saved, profile]) => {
        if (!active) return
        setCredentials(saved)
        if (!email && profile?.personal.email) setEmail(profile.personal.email)
      })
      .catch((error: unknown) => { if (active) setMessage(cleanIpcError(error)) })
    return () => { active = false }
  }, [])

  const save = async () => {
    setBusy(true)
    setMessage('')
    try {
      await window.auta.saveSiteCredential({ siteUrl, email, method, password: method === 'password' ? password : undefined })
      setSiteUrl('')
      setPassword('')
      setMessage('Credential encrypted and saved locally.')
      await reload()
    } catch (error) {
      setMessage(cleanIpcError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-4 p-5">
      <div className="mb-1 flex items-center gap-2">
        <LockKeyhole className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold">Protected site credentials</h2>
        <Badge tone="success" className="ml-auto"><ShieldCheck className="h-3 w-3" /> macOS encrypted</Badge>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        Passwords are encrypted with the macOS keychain and used only by SAGE’s deterministic sign-in broker.
        They are never returned to this screen, placed in logs, or sent to the AI model.
      </p>

      <div className="grid grid-cols-[1.2fr_1fr_0.8fr] gap-3">
        <Field label="Site URL or hostname">
          <Input value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="careers.example.com" />
        </Field>
        <Field label="Account email">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Sign-in method">
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as CredentialLoginMethod)}
            className="h-10 w-full rounded-[var(--radius-input)] bg-background px-3 text-sm shadow-[inset_0_0_0_1px_oklch(var(--input))] no-drag focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="password">Email + password</option>
            <option value="google">Google session</option>
          </select>
        </Field>
        {method === 'password' && (
          <Field label="Password" hint="Encrypted immediately; never shown again.">
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
          </Field>
        )}
        <div className={cn('flex items-end', method === 'password' ? 'col-span-2' : 'col-span-3')}>
          <Button onClick={() => void save()} loading={busy} disabled={!siteUrl.trim() || !email.trim() || (method === 'password' && !password)}>
            <Plus className="h-4 w-4" /> Save credential
          </Button>
          {message && <span className={cn('ml-3 text-xs', /saved/i.test(message) ? 'text-success' : 'text-destructive')}>{message}</span>}
        </div>
      </div>

      {credentials.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-[var(--radius-input)] shadow-[inset_0_0_0_1px_oklch(var(--border))]">
          {credentials.map((credential) => (
            <div key={credential.id} className="flex items-center gap-3 border-t border-border/60 px-3 py-3 first:border-t-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary">
                {credential.method === 'google' ? <Chrome className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{credential.hostname}</div>
                <div className="truncate text-[11px] text-muted-foreground">{credential.email}</div>
              </div>
              <Badge tone={credential.method === 'google' || credential.hasPassword ? 'success' : 'warning'} className="ml-auto">
                {credential.method === 'google' ? 'Google session' : credential.hasPassword ? 'Password protected' : 'Password missing'}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove credential for ${credential.hostname}`}
                onClick={async () => {
                  if (!window.confirm(`Remove the protected credential for ${credential.hostname}?`)) return
                  await window.auta.deleteSiteCredential(credential.id)
                  await reload()
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function cleanIpcError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
}

function GmailCard({ connected, email, onChanged }: { connected: boolean; email?: string; onChanged: () => void }) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const connect = async () => {
    setErr('')
    setBusy(true)
    try {
      if (clientId && clientSecret) await window.auta.gmailSetClient(clientId, clientSecret)
      await window.auta.gmailConnect()
      await onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-4 p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
        <Mail className="h-4 w-4 text-primary" /> Gmail verification
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Read-only access surfaces recent verification codes and links during a run. Gmail never sends messages,
        and this connection is separate from the reusable browser identity above.
      </p>
      {connected ? (
        <Row title="Connected" desc={email}>
          <Badge tone="success">
            <Check className="h-3 w-3" /> {email}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await window.auta.gmailDisconnect()
              await onChanged()
            }}
          >
            Disconnect
          </Button>
        </Row>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Google client ID">
            <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="…apps.googleusercontent.com" />
          </Field>
          <Field label="Google client secret">
            <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
          </Field>
          <div className="col-span-2 flex items-center gap-3">
            <Button onClick={connect} loading={busy}>
              <Mail className="h-4 w-4" /> Connect Gmail
            </Button>
            {err && <span className="text-xs text-destructive">{err}</span>}
          </div>
        </div>
      )}
    </Card>
  )
}

function BrowserIdentityCard({ status, onChanged }: { status: { ready: boolean; sessionOpen: boolean }; onChanged: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const run = async (action: () => Promise<{ ready: boolean; sessionOpen: boolean }>) => {
    setBusy(true)
    setMessage('')
    try {
      const next = await action()
      if (next.sessionOpen && !next.ready) setMessage('Finish signing in in the browser, then click “I’m signed in”.')
      else if (!next.ready) setMessage('No signed-in Google session was detected yet.')
      await onChanged()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-4 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Chrome className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold">Reusable browser identity</h2>
        {status.ready && <Badge tone="success" className="ml-auto"><ShieldCheck className="h-3 w-3" /> Ready</Badge>}
      </div>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">Sign in once in SAGE’s isolated browser profile. Saved site passwords and existing Google sessions can be reused automatically; missing or failed credentials and new consent screens still pause for you.</p>
      {status.sessionOpen ? (
        <div className="flex items-center gap-2">
          <Button loading={busy} onClick={() => run(() => window.auta.browserIdentityComplete())}><Check className="h-4 w-4" /> I’m signed in</Button>
          <Button variant="outline" onClick={() => run(() => window.auta.browserIdentityCancel())}><X className="h-4 w-4" /> Cancel</Button>
        </div>
      ) : status.ready ? (
        <div className="flex items-center gap-2">
          <Badge tone="success"><Check className="h-3 w-3" /> Signed-in session available</Badge>
          <Button className="ml-auto" size="sm" variant="outline" onClick={() => run(() => window.auta.browserIdentityStart())}>Refresh sign-in</Button>
          <Button size="sm" variant="ghost" onClick={() => run(() => window.auta.browserIdentityDisconnect())}>Clear session</Button>
        </div>
      ) : (
        <Button loading={busy} onClick={() => run(() => window.auta.browserIdentityStart())}><Chrome className="h-4 w-4" /> Open secure sign-in</Button>
      )}
      {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
    </Card>
  )
}

function Row({
  title,
  desc,
  warn,
  children
}: {
  title: string
  desc?: string
  warn?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border/60 py-3 first:border-t-0">
      <div className="min-w-0">
        <div className={warn ? 'text-sm font-medium text-warning' : 'text-sm font-medium'}>{title}</div>
        {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}
