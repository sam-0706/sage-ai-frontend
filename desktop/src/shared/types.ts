// Shared domain types — the contract between main and renderer.

export type ProviderId =
  | 'sage'
  | 'claude-code'
  | 'anthropic'
  | 'deepseek'
  | 'openai'
  | 'gemini'
  | 'openrouter'
  | 'together'
  | 'ollama'

export type ProviderTask = 'loop' | 'extract' | 'tailor' | 'answer'

export type AutomationEngine = 'builtin' | 'skyvern'
export type SkyvernRunEngine = 'skyvern-2.0' | 'skyvern-1.0' | 'openai-cua' | 'anthropic-cua' | 'ui-tars'

export interface ProviderConfig {
  id: ProviderId
  label: string
  /** base URL for HTTP providers (ignored for claude-code) */
  baseUrl?: string
  model?: string
  /** whether an API key is present in the keychain (never the key itself) */
  hasKey: boolean
  /** OpenAI-compatible chat endpoint */
  openaiCompatible: boolean
  /** provider exposes an API endpoint that can enumerate available models */
  supportsModelListing?: boolean
}

export interface ProviderModel {
  id: string
  label: string
  type?: string
  contextLength?: number
  /** advertised inputs from the provider's live catalog (for example text, image) */
  inputModalities?: string[]
}

export interface AppSettings {
  /** browser automation runtime; model routing below is used by the built-in runtime */
  automationEngine: AutomationEngine
  /** which provider handles each task */
  taskProviders: Record<ProviderTask, ProviderId>
  autoSubmit: boolean // default false — never auto-clicks through an auth/CAPTCHA gate
  headless: boolean
  minConfidence: number // 0..1 threshold for auto-answering screening questions
  appearance: 'system' | 'dark' | 'light'
  reuseBrowserSession: boolean
  /** prefer an already-authorized Google browser session when a site offers it */
  preferGoogleSignIn: boolean
  /** opt-in: create a site account with a broker-generated password when required */
  autoCreateAccounts: boolean
  /** Skyvern Cloud or self-hosted API root */
  skyvernBaseUrl: string
  /** Skyvern's agent implementation */
  skyvernRunEngine: SkyvernRunEngine
  /** optional persistent Skyvern browser session for login/cookie reuse */
  skyvernBrowserSessionId: string
  /** billable remote-agent safety cap */
  skyvernMaxSteps: number
}

export interface SkyvernStatus {
  hasKey: boolean
  ok?: boolean
  message: string
}

export type CredentialLoginMethod = 'password' | 'google'

/** Safe metadata only. Password material is never returned to the renderer or planner. */
export interface SiteCredential {
  id: string
  scope: string
  hostname: string
  email: string
  method: CredentialLoginMethod
  hasPassword: boolean
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
}

export interface SiteCredentialInput {
  siteUrl: string
  email: string
  method: CredentialLoginMethod
  /** accepted only by the main process and encrypted immediately */
  password?: string
}

// --- Profile (extracted from resume, user-editable) ---------------------

export interface Profile {
  personal: {
    firstName: string
    middleName: string
    lastName: string
    nameSuffix: string
    fullName: string
    preferredName: string
    email: string
    phone: string
    phoneCountryCode: string
    address: string
    city: string
    state: string
    region: string
    country: string
    countryOfResidence: string
    nationality: string
    timeZone: string
    postalCode: string
    linkedinUrl: string
    githubUrl: string
    portfolioUrl: string
    websiteUrl: string
  }
  workAuthorization: {
    legallyAuthorized: string
    requireSponsorship: string
    workPermitType: string
    authorizedCountries: string[]
    sponsorshipCountries: string[]
    usAuthorized: string
    usSponsorship: string
    ukAuthorized: string
    euAuthorized: string
    canadaAuthorized: string
    workPermitExpiry: string
  }
  compensation: {
    salaryExpectation: string
    currency: string
    salaryMin: string
    salaryMax: string
    note: string
    currentBase: string
    currentTotal: string
    currentCurrency: string
    expectedBase: string
    expectedTotal: string
    expectedCurrency: string
    payPeriod: string
    bonus: string
    equity: string
    negotiable: string
  }
  experience: {
    yearsTotal: string
    educationLevel: string
    currentTitle: string
    currentCompany: string
    targetRole: string
  }
  applicationPreferences: {
    comfortableFullyOnsite: string
    willingToRelocate: string
    openToRemote: string
    openToHybrid: string
    openToOnsite: string
    openToUSRemote: string
    openToUSContract: string
    openToInternationalContract: string
    preferredWorkModes: string[]
    employmentTypes: string[]
    targetCountries: string[]
    preferredTimeZones: string[]
    willingToTravel: string
    maxTravelPercent: string
    noticePeriod: string
    availableStartDate: string
  }
  screening: {
    restrictiveCovenant: string
    currentBrandPartner: string
    deployedAiToProduction: string
    previouslyEmployedByCompanies: string[]
    securityClearance: string
    conflictOfInterest: string
    backgroundCheckConsent: string
    drugTestConsent: string
    criminalHistoryNote: string
    referralSource: string
  }
  narratives: {
    professionalSummary: string
    technicalHighlights: string
    aiProductionExample: string
    publicWorkDescription: string
    leadershipSummary: string
    motivation: string
    coverLetterNotes: string
  }
  skills: {
    languages: string[]
    frameworks: string[]
    devops: string[]
    databases: string[]
    tools: string[]
  }
  roles: Array<{
    company: string
    title: string
    start: string
    end: string
    bullets: string[]
  }>
  resumeFacts: {
    companies: string[]
    projects: string[]
    school: string
    metrics: string[]
    education: string[]
    certifications: string[]
    awards: string[]
    publications: string[]
    patents: string[]
    spokenLanguages: string[]
    professionalMemberships: string[]
  }
  eeo: {
    gender: string
    pronouns: string
    hispanicLatino: string
    raceEthnicity: string
    veteranStatus: string
    disabilityStatus: string
  }
}

export type AtsType =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'
  | 'icims'
  | 'taleo'
  | 'linkedin'
  | 'generic'

export interface Job {
  id: string
  url: string
  atsType: AtsType
  title: string
  company: string
  location: string
  jdText: string
  discoveredAt: string
}

export type ApplicationStatus =
  | 'queued'
  | 'running'
  | 'paused_checkpoint'
  | 'submitted'
  | 'failed'
  | 'skipped'

export interface Application {
  id: string
  jobId: string
  status: ApplicationStatus
  engine: string
  provider: ProviderId
  startedAt?: string
  finishedAt?: string
  screenshotPath?: string
  /** Aggregate model usage reported by the selected provider for this run. */
  aiInputTokens?: number
  aiOutputTokens?: number
  /** Actual USD cost reported by the provider; absent when it is not returned. */
  aiCostUsd?: number
  error?: string
  /** current human-readable step, for the live view */
  currentStep?: string
  progress?: number // 0..1
}

// --- Checkpoints (the human-in-the-loop gates) --------------------------

export type CheckpointType =
  | 'captcha'
  | 'account_creation'
  | 'password_or_sso'
  | 'email_otp'
  | 'final_submit'

export interface Checkpoint {
  id: string
  applicationId: string
  type: CheckpointType
  message: string
  raisedAt: string
  /** for email_otp: the surfaced code/link pulled from Gmail, if found */
  otp?: { code?: string; link?: string; from?: string; subject?: string }
  /** optional context for a protected checkpoint */
  question?: string
  suggestedAnswer?: string
  confidence?: number
}

export type CheckpointResolution =
  | { action: 'resume' } // user cleared the gate in the live browser
  | { action: 'submit' } // approve the final submit
  | { action: 'skip' } // skip this application
  | { action: 'answer'; value: string } // provide/override a screening answer
  | { action: 'abort' }

export interface StepEvent {
  applicationId: string
  ts: string
  kind: 'plan' | 'act' | 'verify' | 'checkpoint' | 'info' | 'error' | 'done'
  text: string
  screenshot?: string // data url or file path
}

export interface LlmUsage {
  provider: ProviderId
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  /** Actual provider-reported USD charge, not a locally guessed estimate. */
  costUsd?: number
}

// --- Gmail --------------------------------------------------------------

export interface GmailStatus {
  connected: boolean
  email?: string
  clientConfigured: boolean
  scope?: 'gmail.readonly'
}

export interface BrowserIdentityStatus {
  ready: boolean
  sessionOpen: boolean
  lastCheckedAt?: string
}

// --- IPC surface (typed) ------------------------------------------------

export interface AutaApi {
  // resume + profile
  uploadResume: (fileBytes: ArrayBuffer, name: string) => Promise<{ text: string }>
  extractProfile: (resumeText: string) => Promise<Profile>
  getProfile: () => Promise<Profile | null>
  saveProfile: (p: Profile) => Promise<void>

  // jobs + applications
  addJob: (url: string) => Promise<Job>
  listJobs: () => Promise<Job[]>
  listApplications: () => Promise<Array<Application & { job: Job }>>
  listApplicationEvents: (applicationId: string) => Promise<StepEvent[]>
  startApply: (jobId: string) => Promise<void>
  startApplyAll: () => Promise<void>
  cancelApply: (applicationId: string) => Promise<void>
  removeApplication: (applicationId: string) => Promise<void>
  clearInactiveApplications: () => Promise<void>
  resolveCheckpoint: (checkpointId: string, res: CheckpointResolution) => Promise<void>

  // settings + providers
  getSettings: () => Promise<AppSettings>
  saveSettings: (s: AppSettings) => Promise<void>
  listProviders: () => Promise<ProviderConfig[]>
  listProviderModels: (id: ProviderId) => Promise<ProviderModel[]>
  setProviderKey: (id: ProviderId, key: string) => Promise<void>
  setProviderConfig: (id: ProviderId, cfg: Partial<ProviderConfig>) => Promise<void>
  testProvider: (id: ProviderId) => Promise<{ ok: boolean; message: string }>
  getSkyvernStatus: () => Promise<SkyvernStatus>
  setSkyvernKey: (key: string) => Promise<void>
  testSkyvern: () => Promise<SkyvernStatus>

  // local credential broker (metadata only crosses back to the renderer)
  listSiteCredentials: () => Promise<SiteCredential[]>
  saveSiteCredential: (input: SiteCredentialInput) => Promise<SiteCredential>
  deleteSiteCredential: (id: string) => Promise<void>

  // gmail
  gmailStatus: () => Promise<GmailStatus>
  gmailSetClient: (clientId: string, clientSecret: string) => Promise<void>
  gmailConnect: () => Promise<GmailStatus>
  gmailDisconnect: () => Promise<void>
  gmailFindLatestOtp: () => Promise<Checkpoint['otp'] | null>

  // reusable browser identity (user signs in; the agent reuses the session)
  browserIdentityStatus: () => Promise<BrowserIdentityStatus>
  browserIdentityStart: () => Promise<BrowserIdentityStatus>
  browserIdentityComplete: () => Promise<BrowserIdentityStatus>
  browserIdentityCancel: () => Promise<BrowserIdentityStatus>
  browserIdentityDisconnect: () => Promise<BrowserIdentityStatus>

  // data
  wipeAllData: () => Promise<void>

  // events (main -> renderer)
  onStep: (cb: (e: StepEvent) => void) => () => void
  onCheckpoint: (cb: (c: Checkpoint) => void) => () => void
  onApplicationUpdate: (cb: (a: Application) => void) => () => void
}
