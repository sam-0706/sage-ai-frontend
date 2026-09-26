import { randomUUID } from 'crypto'
import type {
  Application,
  Checkpoint,
  CheckpointResolution,
  StepEvent
} from '@shared/types'
import * as store from '../store/db'
import { BuiltinEngine, type CheckpointRequest } from '../engine/builtin'
import { SkyvernEngine } from '../engine/skyvern'
import { getProfile, getSettings } from '../store/db'
import { emptyProfile } from '../resume/extract'
import { findLatestOtp } from '../gmail'
import { hasSecret, secretName } from '../secrets/keychain'

export interface Emitter {
  step: (e: StepEvent) => void
  checkpoint: (c: Checkpoint) => void
  application: (a: Application) => void
}

export class Orchestrator {
  private builtinEngine = new BuiltinEngine()
  private skyvernEngine = new SkyvernEngine()
  private pending = new Map<string, (res: CheckpointResolution) => void>()
  private cancelFlags = new Map<string, boolean>()
  private running = new Set<string>()
  /** serializes browser runs so only ONE Chrome opens at a time */
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private emit: Emitter) {}

  private enqueue(fn: () => Promise<void>): Promise<void> {
    const next = this.chain.then(fn, fn)
    this.chain = next.catch(() => {})
    return next
  }

  private hasActiveFor(jobId: string): boolean {
    return store
      .listApplications()
      .some((a) => a.jobId === jobId && ['queued', 'running', 'paused_checkpoint'].includes(a.status))
  }

  async startApply(jobId: string): Promise<void> {
    if (this.hasActiveFor(jobId)) return // ignore double-clicks / duplicate runs
    const settings = getSettings()
    const app = store.createApplication(jobId, this.engineName(settings), settings.taskProviders.loop)
    void this.enqueue(() => this.run(app.id))
  }

  async startApplyAll(): Promise<void> {
    const jobs = store.listJobs()
    const settings = getSettings()
    for (const j of jobs) {
      if (this.hasActiveFor(j.id)) continue
      store.createApplication(j.id, this.engineName(settings), settings.taskProviders.loop)
    }
    // run queued strictly one-at-a-time via the shared chain
    for (const a of store.findQueued()) {
      void this.enqueue(() => this.run(a.id))
    }
  }

  cancel(applicationId: string): void {
    this.cancelFlags.set(applicationId, true)
    // if it is waiting on a checkpoint, release it as abort
    for (const [cid, resolve] of this.pending) {
      if (cid.startsWith(applicationId)) {
        resolve({ action: 'abort' })
        this.pending.delete(cid)
      }
    }
  }

  resolveCheckpoint(checkpointId: string, res: CheckpointResolution): void {
    const resolve = this.pending.get(checkpointId)
    if (resolve) {
      resolve(res)
      this.pending.delete(checkpointId)
    }
  }

  private async run(applicationId: string): Promise<void> {
    if (this.running.has(applicationId)) return
    this.running.add(applicationId)
    this.cancelFlags.set(applicationId, false)

    const appRow = store.getApplication(applicationId)
    if (!appRow) return
    const job = store.getJob(appRow.jobId)
    if (!job) return

    const profile = getProfile() ?? emptyProfile()
    const settings = getSettings()
    const resumePath = store.getResumePath()
    let aiInputTokens = appRow.aiInputTokens ?? 0
    let aiOutputTokens = appRow.aiOutputTokens ?? 0
    let aiCostUsd = appRow.aiCostUsd

    this.update(applicationId, { status: 'running', startedAt: new Date().toISOString(), currentStep: 'Starting…' })

    const engine = appRow.engine === this.skyvernEngine.name ? this.skyvernEngine : this.builtinEngine
    const outcome = await engine.apply({
      job,
      profile,
      resumePath,
      settings,
      hooks: {
        onStep: (kind, text, screenshot) => {
          const e: StepEvent = {
            applicationId,
            ts: new Date().toISOString(),
            kind: kind as StepEvent['kind'],
            text,
            screenshot: screenshot ? `data:${screenshot[0] === 0xff ? 'image/jpeg' : 'image/png'};base64,${screenshot.toString('base64')}` : undefined
          }
          store.recordApplicationEvent(e)
          this.emit.step(e)
          this.update(applicationId, { currentStep: text.slice(0, 120) }, false)
        },
        onUsage: (usage) => {
          aiInputTokens += usage.inputTokens
          aiOutputTokens += usage.outputTokens
          if (usage.costUsd !== undefined) aiCostUsd = (aiCostUsd ?? 0) + usage.costUsd
          this.update(applicationId, {
            aiInputTokens,
            aiOutputTokens,
            ...(aiCostUsd !== undefined ? { aiCostUsd } : {})
          }, false)
        },
        requestCheckpoint: (req) => this.raiseCheckpoint(applicationId, req),
        isCancelled: () => this.cancelFlags.get(applicationId) === true
      }
    })

    const finalEvent: StepEvent = {
      applicationId,
      ts: new Date().toISOString(),
      kind: outcome.status === 'submitted' ? 'done' : outcome.status === 'failed' ? 'error' : 'info',
      text: outcome.status === 'submitted'
        ? 'Submission confirmed. The success-page screenshot and complete run log were saved as this application receipt.'
        : outcome.error ?? `Application ${outcome.status}.`
    }
    store.recordApplicationEvent(finalEvent)
    this.emit.step(finalEvent)

    this.update(applicationId, {
      status: outcome.status,
      finishedAt: new Date().toISOString(),
      screenshotPath: outcome.screenshotPath,
      error: outcome.error,
      progress: outcome.status === 'submitted' ? 1 : appRow.progress,
      currentStep: outcome.status === 'submitted' ? 'Submitted' : outcome.error ?? outcome.status
    })
    this.running.delete(applicationId)
  }

  private engineName(settings: ReturnType<typeof getSettings>): string {
    // Keep applications runnable while Skyvern is being configured. Once a
    // key exists, newly queued runs use Skyvern; already queued rows preserve
    // the engine they were created with.
    return settings.automationEngine === 'skyvern' && hasSecret(secretName.skyvernApiKey())
      ? this.skyvernEngine.name
      : this.builtinEngine.name
  }

  private raiseCheckpoint(applicationId: string, req: CheckpointRequest): Promise<CheckpointResolution> {
    const id = `${applicationId}:${randomUUID().slice(0, 8)}`
    const cp: Checkpoint = {
      id,
      applicationId,
      type: req.type,
      message: req.message,
      raisedAt: new Date().toISOString(),
      question: req.question,
      suggestedAnswer: req.suggestedAnswer,
      confidence: req.confidence
    }

    this.update(applicationId, { status: 'paused_checkpoint', currentStep: `Waiting: ${req.type}` }, true)

    // For email OTP, try to surface the code/link from Gmail (read-only).
    const enrich = req.type === 'email_otp' ? this.surfaceOtp(cp) : Promise.resolve(cp)

    return enrich.then(
      (finalCp) =>
        new Promise<CheckpointResolution>((resolve) => {
          this.pending.set(id, (res) => {
            this.update(applicationId, { status: 'running' }, true)
            resolve(res)
          })
          this.emit.checkpoint(finalCp)
          if (req.autoResumeWhen) {
            void req.autoResumeWhen()
              .then((ready) => {
                if (ready && this.pending.has(id)) this.resolveCheckpoint(id, { action: 'resume' })
              })
              .catch(() => {})
          }
        })
    )
  }

  private async surfaceOtp(cp: Checkpoint): Promise<Checkpoint> {
    try {
      const otp = await findLatestOtp()
      if (otp) cp.otp = otp
    } catch {
      /* gmail not connected — user reads their own email */
    }
    return cp
  }

  private update(applicationId: string, patch: Partial<Application>, emitEvent = true): void {
    const updated = store.updateApplication(applicationId, patch)
    if (updated && emitEvent) this.emit.application(updated)
  }
}
