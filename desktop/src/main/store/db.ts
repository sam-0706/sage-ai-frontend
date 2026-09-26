import Database from 'better-sqlite3'
import { paths } from './paths'
import type {
  Application,
  ApplicationStatus,
  AppSettings,
  Job,
  Profile,
  ProviderConfig,
  ProviderId,
  SiteCredential,
  CredentialLoginMethod,
  StepEvent
} from '@shared/types'
import { normalizeProfile } from '@shared/profileDefaults'
import { randomUUID } from 'crypto'

let db: Database.Database

export function reconcileStale(): void {
  // Runs that were mid-flight when the app last closed have no live browser
  // behind them — mark them failed so they don't show as ghost "Needs you" rows.
  db.prepare(
    "UPDATE applications SET status='failed', error='Interrupted (app restarted)' WHERE status IN ('running','paused_checkpoint','queued')"
  ).run()
}

export function removeApplication(id: string): void {
  db.prepare('DELETE FROM application_events WHERE application_id = ?').run(id)
  db.prepare('DELETE FROM answers WHERE application_id = ?').run(id)
  db.prepare('DELETE FROM applications WHERE id = ?').run(id)
}

export function clearInactiveApplications(): void {
  db.prepare(
    "DELETE FROM application_events WHERE application_id IN (SELECT id FROM applications WHERE status IN ('failed','skipped','submitted'))"
  ).run()
  db.prepare(
    "DELETE FROM answers WHERE application_id IN (SELECT id FROM applications WHERE status IN ('failed','skipped','submitted'))"
  ).run()
  db.prepare("DELETE FROM applications WHERE status IN ('failed','skipped','submitted')").run()
}

export function initDb(): void {
  db = new Database(paths.db())
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      ats_type TEXT NOT NULL,
      title TEXT,
      company TEXT,
      location TEXT,
      jd_text TEXT,
      discovered_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      status TEXT NOT NULL,
      engine TEXT,
      provider TEXT,
      started_at TEXT,
      finished_at TEXT,
      screenshot_path TEXT,
      ai_input_tokens INTEGER,
      ai_output_tokens INTEGER,
      ai_cost_usd REAL,
      error TEXT,
      current_step TEXT,
      progress REAL,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );
    CREATE TABLE IF NOT EXISTS answers (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT,
      confidence REAL,
      approved INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS application_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(id)
    );
    CREATE INDEX IF NOT EXISTS idx_application_events_application
      ON application_events(application_id, id);
    CREATE TABLE IF NOT EXISTS site_credentials (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      hostname TEXT NOT NULL,
      email TEXT NOT NULL,
      method TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_used_at TEXT,
      UNIQUE(scope, email)
    );
  `)
  ensureApplicationReceiptColumns()
  reconcileStale()
}

function ensureApplicationReceiptColumns(): void {
  const existing = new Set(
    (db.prepare('PRAGMA table_info(applications)').all() as Array<{ name: string }>).map((column) => column.name)
  )
  const additions: Array<[string, string]> = [
    ['ai_input_tokens', 'INTEGER'],
    ['ai_output_tokens', 'INTEGER'],
    ['ai_cost_usd', 'REAL']
  ]
  for (const [name, type] of additions) {
    if (!existing.has(name)) db.exec(`ALTER TABLE applications ADD COLUMN ${name} ${type}`)
  }
}

function getKv(key: string): string | null {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function setKv(key: string, value: string): void {
  db.prepare(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}

// --- Profile ------------------------------------------------------------

export function getProfile(): Profile | null {
  const raw = getKv('profile')
  if (!raw) return null
  return normalizeProfile(JSON.parse(raw) as Partial<Profile>)
}

export function saveProfile(p: Profile): void {
  setKv('profile', JSON.stringify(p))
}

// --- Resume file path (for uploads to forms) ---------------------------

export function getResumePath(): string | null {
  return getKv('resumePath')
}

export function setResumePath(p: string): void {
  setKv('resumePath', p)
}

// --- Settings -----------------------------------------------------------

const DEFAULT_SETTINGS: AppSettings = {
  automationEngine: 'builtin',
  // SAGE-hosted models (OpenRouter behind the SAGE proxy) — no API key needed on the desktop.
  taskProviders: {
    loop: 'sage',
    extract: 'sage',
    tailor: 'sage',
    answer: 'sage'
  },
  autoSubmit: false,
  headless: false,
  minConfidence: 0.7,
  appearance: 'system',
  reuseBrowserSession: true,
  preferGoogleSignIn: true,
  autoCreateAccounts: false,
  skyvernBaseUrl: 'https://api.skyvern.com',
  skyvernRunEngine: 'skyvern-2.0',
  skyvernBrowserSessionId: '',
  skyvernMaxSteps: 60
}

export function getBrowserIdentityMarker(): { ready: boolean; lastCheckedAt?: string } {
  const raw = getKv('browserIdentity')
  return raw ? JSON.parse(raw) : { ready: false }
}

export function setBrowserIdentityMarker(value: { ready: boolean; lastCheckedAt?: string }): void {
  setKv('browserIdentity', JSON.stringify(value))
}

export function getSettings(): AppSettings {
  const raw = getKv('settings')
  return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
}

export function saveSettings(s: AppSettings): void {
  setKv('settings', JSON.stringify(s))
}

// --- Provider (non-secret) config --------------------------------------

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  { id: 'sage', label: 'SAGE AI (included with your plan)', model: 'sage-vision', hasKey: false, openaiCompatible: true, supportsModelListing: true },
  { id: 'claude-code', label: 'Claude Code (local CLI)', hasKey: false, openaiCompatible: false, model: 'claude-opus-5' },
  { id: 'anthropic', label: 'Anthropic API', baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5', hasKey: false, openaiCompatible: false },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', hasKey: false, openaiCompatible: true, supportsModelListing: true },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hasKey: false, openaiCompatible: true, supportsModelListing: true },
  { id: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', hasKey: false, openaiCompatible: true, supportsModelListing: true },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: '~anthropic/claude-sonnet-latest', hasKey: false, openaiCompatible: true, supportsModelListing: true },
  { id: 'together', label: 'Together AI', baseUrl: 'https://api.together.ai/v1', model: 'moonshotai/Kimi-K2.5', hasKey: false, openaiCompatible: true, supportsModelListing: true },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.1', hasKey: false, openaiCompatible: true, supportsModelListing: true }
]

export function getProviderConfigs(): ProviderConfig[] {
  const raw = getKv('providers')
  const saved: Record<string, Partial<ProviderConfig>> = raw ? JSON.parse(raw) : {}
  return DEFAULT_PROVIDERS.map((d) => ({ ...d, ...saved[d.id] }))
}

export function setProviderConfig(id: ProviderId, cfg: Partial<ProviderConfig>): void {
  const raw = getKv('providers')
  const saved: Record<string, Partial<ProviderConfig>> = raw ? JSON.parse(raw) : {}
  // never persist hasKey here — it is derived from the keychain
  const { hasKey, ...rest } = cfg
  saved[id] = { ...saved[id], ...rest }
  setKv('providers', JSON.stringify(saved))
}

// --- Jobs ---------------------------------------------------------------

export function addJob(job: Omit<Job, 'id' | 'discoveredAt'> & Partial<Pick<Job, 'id'>>): Job {
  const existing = db.prepare('SELECT * FROM jobs WHERE url = ?').get(job.url) as
    | Record<string, unknown>
    | undefined
  if (existing) return rowToJob(existing)
  const full: Job = {
    id: job.id ?? randomUUID(),
    url: job.url,
    atsType: job.atsType,
    title: job.title,
    company: job.company,
    location: job.location,
    jdText: job.jdText,
    discoveredAt: new Date().toISOString()
  }
  db.prepare(
    `INSERT INTO jobs (id, url, ats_type, title, company, location, jd_text, discovered_at)
     VALUES (@id, @url, @atsType, @title, @company, @location, @jdText, @discoveredAt)`
  ).run(full)
  return full
}

export function updateJob(id: string, patch: Partial<Job>): void {
  const cur = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!cur) return
  const merged = { ...rowToJob(cur), ...patch }
  db.prepare(
    `UPDATE jobs SET url=@url, ats_type=@atsType, title=@title, company=@company,
     location=@location, jd_text=@jdText WHERE id=@id`
  ).run(merged)
}

export function listJobs(): Job[] {
  const rows = db.prepare('SELECT * FROM jobs ORDER BY discovered_at DESC').all() as Record<string, unknown>[]
  return rows.map(rowToJob)
}

export function getJob(id: string): Job | null {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToJob(row) : null
}

function rowToJob(r: Record<string, unknown>): Job {
  return {
    id: r.id as string,
    url: r.url as string,
    atsType: r.ats_type as Job['atsType'],
    title: (r.title as string) ?? '',
    company: (r.company as string) ?? '',
    location: (r.location as string) ?? '',
    jdText: (r.jd_text as string) ?? '',
    discoveredAt: r.discovered_at as string
  }
}

// --- Applications -------------------------------------------------------

export function createApplication(jobId: string, engine: string, provider: ProviderId): Application {
  const app: Application = {
    id: randomUUID(),
    jobId,
    status: 'queued',
    engine,
    provider,
    progress: 0
  }
  db.prepare(
    `INSERT INTO applications (id, job_id, status, engine, provider, progress)
     VALUES (@id, @jobId, @status, @engine, @provider, @progress)`
  ).run(app)
  return app
}

export function updateApplication(id: string, patch: Partial<Application>): Application | null {
  const cur = getApplication(id)
  if (!cur) return null
  const m = { ...cur, ...patch }
  db.prepare(
    `UPDATE applications SET status=@status, engine=@engine, provider=@provider,
     started_at=@startedAt, finished_at=@finishedAt, screenshot_path=@screenshotPath,
     ai_input_tokens=@aiInputTokens, ai_output_tokens=@aiOutputTokens, ai_cost_usd=@aiCostUsd,
     error=@error, current_step=@currentStep, progress=@progress WHERE id=@id`
  ).run({
    id: m.id,
    status: m.status,
    engine: m.engine,
    provider: m.provider,
    startedAt: m.startedAt ?? null,
    finishedAt: m.finishedAt ?? null,
    screenshotPath: m.screenshotPath ?? null,
    aiInputTokens: m.aiInputTokens ?? null,
    aiOutputTokens: m.aiOutputTokens ?? null,
    aiCostUsd: m.aiCostUsd ?? null,
    error: m.error ?? null,
    currentStep: m.currentStep ?? null,
    progress: m.progress ?? 0
  })
  return m
}

export function getApplication(id: string): Application | null {
  const r = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return r ? rowToApp(r) : null
}

export function listApplications(): Array<Application & { job: Job }> {
  const rows = db
    .prepare('SELECT * FROM applications ORDER BY rowid DESC')
    .all() as Record<string, unknown>[]
  return rows
    .map(rowToApp)
    .map((a) => ({ ...a, job: getJob(a.jobId)! }))
    .filter((a) => a.job)
}

export function findQueued(): Array<Application & { job: Job }> {
  return listApplications().filter((a) => a.status === 'queued')
}

function rowToApp(r: Record<string, unknown>): Application {
  return {
    id: r.id as string,
    jobId: r.job_id as string,
    status: r.status as ApplicationStatus,
    engine: (r.engine as string) ?? '',
    provider: (r.provider as ProviderId) ?? 'deepseek',
    startedAt: (r.started_at as string) ?? undefined,
    finishedAt: (r.finished_at as string) ?? undefined,
    screenshotPath: (r.screenshot_path as string) ?? undefined,
    aiInputTokens: (r.ai_input_tokens as number) ?? undefined,
    aiOutputTokens: (r.ai_output_tokens as number) ?? undefined,
    aiCostUsd: (r.ai_cost_usd as number) ?? undefined,
    error: (r.error as string) ?? undefined,
    currentStep: (r.current_step as string) ?? undefined,
    progress: (r.progress as number) ?? 0
  }
}

// --- Persistent application activity -----------------------------------

export function recordApplicationEvent(event: StepEvent): void {
  db.prepare(
    `INSERT INTO application_events (application_id, ts, kind, text)
     VALUES (@applicationId, @ts, @kind, @text)`
  ).run({
    applicationId: event.applicationId,
    ts: event.ts,
    kind: event.kind,
    text: event.text
  })
}

export function listApplicationEvents(applicationId: string): StepEvent[] {
  const rows = db
    .prepare(
      `SELECT application_id, ts, kind, text
       FROM application_events WHERE application_id = ? ORDER BY id ASC`
    )
    .all(applicationId) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    applicationId: String(row.application_id),
    ts: String(row.ts),
    kind: row.kind as StepEvent['kind'],
    text: String(row.text)
  }))
}

// --- Answers ------------------------------------------------------------

export function recordAnswer(
  applicationId: string,
  question: string,
  answer: string,
  confidence: number,
  approved: boolean
): void {
  db.prepare(
    `INSERT INTO answers (id, application_id, question, answer, confidence, approved)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), applicationId, question, answer, confidence, approved ? 1 : 0)
}

// --- Site credential metadata -----------------------------------------

export function listSiteCredentials(): SiteCredential[] {
  const rows = db
    .prepare('SELECT * FROM site_credentials ORDER BY updated_at DESC')
    .all() as Record<string, unknown>[]
  return rows.map(rowToSiteCredential)
}

export function findSiteCredential(scope: string, email: string): SiteCredential | null {
  const exact = db
    .prepare('SELECT * FROM site_credentials WHERE scope = ? AND lower(email) = lower(?) LIMIT 1')
    .get(scope, email) as Record<string, unknown> | undefined
  if (exact) return rowToSiteCredential(exact)
  const anyForScope = db
    .prepare('SELECT * FROM site_credentials WHERE scope = ? ORDER BY updated_at DESC LIMIT 1')
    .get(scope) as Record<string, unknown> | undefined
  return anyForScope ? rowToSiteCredential(anyForScope) : null
}

export function upsertSiteCredentialRecord(input: {
  scope: string
  hostname: string
  email: string
  method: CredentialLoginMethod
}): SiteCredential {
  const now = new Date().toISOString()
  const existing = db
    .prepare('SELECT * FROM site_credentials WHERE scope = ? AND lower(email) = lower(?) LIMIT 1')
    .get(input.scope, input.email) as Record<string, unknown> | undefined
  const id = existing ? String(existing.id) : randomUUID()
  db.prepare(
    `INSERT INTO site_credentials (id, scope, hostname, email, method, created_at, updated_at)
     VALUES (@id, @scope, @hostname, @email, @method, @createdAt, @updatedAt)
     ON CONFLICT(scope, email) DO UPDATE SET
       hostname=excluded.hostname, method=excluded.method, updated_at=excluded.updated_at`
  ).run({ id, ...input, createdAt: existing?.created_at ?? now, updatedAt: now })
  return findSiteCredential(input.scope, input.email)!
}

export function touchSiteCredential(id: string): void {
  db.prepare('UPDATE site_credentials SET last_used_at = ?, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), new Date().toISOString(), id)
}

export function deleteSiteCredentialRecord(id: string): void {
  db.prepare('DELETE FROM site_credentials WHERE id = ?').run(id)
}

function rowToSiteCredential(r: Record<string, unknown>): SiteCredential {
  return {
    id: String(r.id),
    scope: String(r.scope),
    hostname: String(r.hostname),
    email: String(r.email),
    method: r.method as CredentialLoginMethod,
    hasPassword: false,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    lastUsedAt: r.last_used_at ? String(r.last_used_at) : undefined
  }
}

// --- Wipe ---------------------------------------------------------------

export function wipeAll(): void {
  db.exec('DELETE FROM application_events; DELETE FROM answers; DELETE FROM applications; DELETE FROM jobs; DELETE FROM site_credentials; DELETE FROM kv;')
}
