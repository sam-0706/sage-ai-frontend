import { createReadStream, writeFileSync } from 'fs'
import { join } from 'path'
import { Skyvern } from '@skyvern/client'
import type { AppSettings, Profile, SkyvernStatus } from '@shared/types'
import { profileFacts } from '../ats/mapping'
import { getSecret, hasSecret, secretName } from '../secrets/keychain'
import { paths } from '../store/paths'
import type { ApplyContext, ApplyOutcome } from './builtin'

const TERMINAL = new Set(['completed', 'failed', 'terminated', 'timed_out', 'canceled'])

function baseUrl(settings: AppSettings): string {
  return (settings.skyvernBaseUrl || 'https://api.skyvern.com').replace(/\/+$/, '')
}

function clientFor(settings: AppSettings): Skyvern {
  const key = getSecret(secretName.skyvernApiKey())
  if (!key) throw new Error('Skyvern API key is not configured. Add it in Settings, then test the connection.')
  return new Skyvern({ apiKey: key, baseUrl: baseUrl(settings), timeoutInSeconds: 90, maxRetries: 2 })
}

export function skyvernStatus(): SkyvernStatus {
  const configured = hasSecret(secretName.skyvernApiKey())
  return {
    hasKey: configured,
    message: configured ? 'Skyvern API key is stored securely.' : 'No Skyvern API key is stored.'
  }
}

export async function testSkyvernConnection(settings: AppSettings): Promise<SkyvernStatus> {
  const stored = skyvernStatus()
  if (!stored.hasKey) return { ...stored, ok: false }
  try {
    const client = clientFor(settings)
    await client.getBrowserSessions({ timeoutInSeconds: 20, maxRetries: 0 })
    return { hasKey: true, ok: true, message: `Connected to ${baseUrl(settings)}.` }
  } catch (error) {
    return {
      hasKey: true,
      ok: false,
      message: `Skyvern connection failed: ${cleanError(error)}`
    }
  }
}

export class SkyvernEngine {
  readonly name = 'skyvern'

  async apply(ctx: ApplyContext): Promise<ApplyOutcome> {
    let runId = ''
    try {
      const client = clientFor(ctx.settings)
      const resumeUrl = await this.uploadResume(client, ctx.resumePath, ctx.hooks.onStep)
      const start = await client.runTask({
        body: {
          title: `SAGE: ${ctx.job.title || 'job application'} at ${ctx.job.company || 'employer'}`,
          url: ctx.job.url,
          prompt: buildPrompt(ctx.profile, ctx.settings.autoSubmit, resumeUrl),
          engine: ctx.settings.skyvernRunEngine,
          max_steps: Math.max(10, Math.min(200, Math.round(ctx.settings.skyvernMaxSteps || 60))),
          browser_session_id: ctx.settings.skyvernBrowserSessionId.trim() || undefined,
          include_action_history_in_verification: true,
          data_extraction_schema: {
            type: 'object',
            required: ['submitted', 'evidence'],
            properties: {
              submitted: { type: 'boolean' },
              evidence: { type: 'string' },
              final_url: { type: 'string' }
            }
          }
        }
      })
      runId = start.run_id
      ctx.hooks.onStep(
        'info',
        `Skyvern run ${runId} started with ${ctx.settings.skyvernRunEngine}. Open ${start.app_url || 'the Skyvern dashboard'} to watch its live browser.`
      )

      let lastMarker = ''
      const deadline = Date.now() + 30 * 60 * 1000
      while (Date.now() < deadline) {
        if (ctx.hooks.isCancelled()) {
          await client.cancelRun(runId).catch(() => {})
          return { status: 'skipped', error: 'Cancelled by user; the Skyvern run was cancelled.' }
        }
        const run = await client.getRun(runId)
        const marker = `${run.status}:${run.step_count ?? 0}`
        if (marker !== lastMarker) {
          const shot = await latestScreenshot(run.screenshot_urls)
          ctx.hooks.onStep('info', `Skyvern ${run.status} · ${run.step_count ?? 0} steps`, shot ?? undefined)
          lastMarker = marker
        }
        if (TERMINAL.has(run.status)) {
          const screenshotPath = await saveFinalScreenshot(run.screenshot_urls, ctx.job.id)
          if (run.status !== 'completed') {
            return {
              status: 'failed',
              screenshotPath,
              error: run.failure_reason || `Skyvern ended with status ${run.status}.`
            }
          }
          const proof = submissionProof(run.output)
          if (ctx.settings.autoSubmit && proof.submitted && proof.evidence) {
            ctx.hooks.onStep('done', `Skyvern verified submission: ${proof.evidence}`)
            return { status: 'submitted', screenshotPath }
          }
          if (!ctx.settings.autoSubmit) {
            return {
              status: 'skipped',
              screenshotPath,
              error: 'Skyvern filled the application but auto-submit is off; no submission was claimed.'
            }
          }
          return {
            status: 'failed',
            screenshotPath,
            error: 'Skyvern completed without verified submission evidence, so SAGE did not mark this application submitted.'
          }
        }
        await delay(2000)
      }
      await client.cancelRun(runId).catch(() => {})
      return { status: 'failed', error: 'Skyvern timed out after 30 minutes and was cancelled.' }
    } catch (error) {
      return {
        status: 'failed',
        error: `${runId ? `Skyvern run ${runId} failed` : 'Skyvern could not start'}: ${cleanError(error)}`
      }
    }
  }

  private async uploadResume(
    client: Skyvern,
    resumePath: string | null,
    onStep: ApplyContext['hooks']['onStep']
  ): Promise<string> {
    if (!resumePath) return ''
    onStep('info', 'Uploading the saved resume to the selected Skyvern service for this application.')
    const uploaded = await client.uploadFile({ file: createReadStream(resumePath) })
    return uploaded.presigned_url
  }
}

function buildPrompt(profile: Profile, autoSubmit: boolean, resumeUrl: string): string {
  return `Apply to the job at the supplied URL for this candidate.

Operational requirements:
- Work through every page of the application. Fill required fields and useful optional questions using only the candidate facts below.
- For dropdowns and autocompletes, open the control, inspect its visible options, and click the closest truthful option. Never repeatedly type into a finite-choice control.
- If a signed-in site controls a contact-email dropdown and the candidate email is unavailable, keep the valid selected account email and continue.
- Re-observe after every action. If a field is already correct, move to the next field or click Next/Continue/Review instead of filling it again.
- Upload the resume from the supplied resume URL when the form requests a resume.
- Never invent qualifications, authorization, demographic information, compensation, or consent.
- If authentication is required, use only an already-authenticated Skyvern browser session or credentials already configured inside Skyvern. Do not request, expose, or guess a password.
- If CAPTCHA or another human-verification challenge appears, stop and report that challenge; do not bypass it.
- ${autoSubmit ? 'Submit the application. Do not finish merely because the form is filled: verify an explicit success/thank-you/received confirmation after clicking the final submission control.' : 'Do not click the final submission control; stop on the review page.'}
- Return submitted=true only after visible submission confirmation. Put the exact confirmation text in evidence. Otherwise return submitted=false and explain what prevented submission.

Resume URL:
${resumeUrl || '(No resume file is available.)'}

Candidate facts:
${profileFacts(profile)}`
}

function submissionProof(output: unknown): { submitted: boolean; evidence: string } {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return { submitted: false, evidence: '' }
  const record = output as Record<string, unknown>
  return {
    submitted: record.submitted === true,
    evidence: typeof record.evidence === 'string' ? record.evidence.trim() : ''
  }
}

async function latestScreenshot(urls: string[] | undefined): Promise<Buffer | null> {
  const url = urls?.[0]
  if (!url) return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return Buffer.from(await response.arrayBuffer())
  } catch {
    return null
  }
}

async function saveFinalScreenshot(urls: string[] | undefined, jobId: string): Promise<string | undefined> {
  const image = await latestScreenshot(urls)
  if (!image) return undefined
  const file = join(paths.screenshots(), `${jobId}-skyvern-${Date.now()}.png`)
  writeFileSync(file, image)
  return file
}

function cleanError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
