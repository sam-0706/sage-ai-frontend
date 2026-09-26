import { type BrowserContext, type Page, type Locator } from 'playwright'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type {
  AppSettings,
  CheckpointResolution,
  CheckpointType,
  Job,
  LlmUsage,
  Profile
} from '@shared/types'
import { paths } from '../store/paths'
import { launchAgentBrowser } from './launch'
import { observe, type Observation } from './observe'
import { detectCheckpoint } from './checkpointDetector'
import { chatForTask, parseJson, type Msg } from '../providers'
import { profileFacts } from '../ats/mapping'
import {
  createAuthenticationState,
  handleAuthentication,
  type AuthenticationState
} from '../auth/broker'
import { credentialMetadataForSite } from '../auth/credentials'

export interface CheckpointRequest {
  type: CheckpointType
  message: string
  question?: string
  suggestedAnswer?: string
  confidence?: number
  /** Resolves a visible auth checkpoint when the browser becomes signed in. */
  autoResumeWhen?: () => Promise<boolean>
}

export interface ApplyHooks {
  onStep: (kind: string, text: string, screenshot?: Buffer) => void
  onUsage: (usage: LlmUsage) => void
  requestCheckpoint: (req: CheckpointRequest) => Promise<CheckpointResolution>
  isCancelled: () => boolean
}

export interface ApplyContext {
  job: Job
  profile: Profile
  resumePath: string | null
  settings: AppSettings
  hooks: ApplyHooks
}

export interface ApplyOutcome {
  status: 'submitted' | 'failed' | 'skipped'
  screenshotPath?: string
  error?: string
}

interface PlannedAction {
  action: 'click' | 'type' | 'select' | 'upload' | 'scroll' | 'checkpoint' | 'answer_needed' | 'navigate' | 'done'
  target?: number | string
  text?: string
  value?: string
  direction?: 'up' | 'down'
  file?: 'resume'
  url?: string
  type_?: CheckpointType
  checkpointType?: CheckpointType
  message?: string
  question?: string
  suggested?: string
  confidence?: number
  success?: boolean
  reason?: string
}

const MAX_STEPS = 60

const ACTIVE_MODAL_SELECTOR = [
  'dialog[open]:visible',
  '[role="dialog"]:visible',
  '[aria-modal="true"]:visible',
  '[data-test-modal-id="easy-apply-modal"]:visible',
  '[data-test-modal-container][aria-hidden="false"]:visible',
  '.artdeco-modal-overlay--is-top-layer:visible'
].join(', ')

// If a stray link takes us to one of these, we go back — never fill forms there.
const OFFTASK_HOSTS = [
  'linkedin.com',
  'twitter.com',
  '://x.com',
  'facebook.com',
  'instagram.com',
  'youtube.com',
  'accounts.google.com',
  'google.com/search'
]

export class BuiltinEngine {
  readonly name = 'builtin-playwright'

  async apply(ctx: ApplyContext): Promise<ApplyOutcome> {
    const { job, settings, hooks } = ctx
    let context: BrowserContext | null = null
    try {
      context = await launchAgentBrowser(paths.browserProfile(), {
        // Human-verification checkpoints require a visible window. A hidden
        // browser would strand the run the first time a CAPTCHA appears.
        headless: false,
        viewport: { width: 1280, height: 900 },
        args: ['--disable-blink-features=AutomationControlled']
      })
      const page = context.pages()[0] ?? (await context.newPage())
      hooks.onStep('info', `Opening ${job.url}`)
      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
      await page.waitForTimeout(1500)

      const outcome = await this.loop(page, ctx)
      return outcome
    } catch (e) {
      return { status: 'failed', error: e instanceof Error ? e.message : String(e) }
    } finally {
      await context?.close().catch(() => {})
    }
  }

  private async loop(page: Page, ctx: ApplyContext): Promise<ApplyOutcome> {
    const { hooks, settings } = ctx
    let currentPage = page
    const history: string[] = []
    let stuck = 0
    let plannerFailures = 0
    const recent: string[] = []
    const completedFields = new Set<string>()
    const agentOnlyFields = new Set<string>()
    const authentication = createAuthenticationState()

    for (let step = 0; step < MAX_STEPS; step++) {
      if (hooks.isCancelled()) return { status: 'skipped', error: 'Cancelled by user' }
      if (currentPage.isClosed()) {
        currentPage = currentPage.context().pages().find((candidate) => !candidate.isClosed()) ?? currentPage
      }
      if (hasAuthenticationActivity(authentication)) {
        currentPage = await selectBestAuthenticationPage(currentPage, ctx.job.url)
      }

      // Submission confirmation always wins over gate/stuck detection. Some
      // ATS pages leave the old form controls mounted behind a success banner,
      // which previously made the agent keep planning after the application
      // had already gone through.
      if (await verifySubmitted(currentPage)) {
        hooks.onStep('info', 'Submission confirmed — application completed successfully.')
        const shot = await this.capture(currentPage, ctx.job)
        return { status: 'submitted', screenshotPath: shot }
      }

      // Authentication is handled by a deterministic broker before the page is
      // ever exposed to the AI planner. It may use a protected site credential,
      // an existing Google session, or prepare an opted-in account creation.
      const auth = await handleAuthentication(currentPage, ctx.profile, settings, authentication)
      if (auth.status === 'handled') {
        if (auth.page) currentPage = auth.page
        hooks.onStep('info', auth.message ?? 'Authentication step completed securely.')
        await currentPage.waitForTimeout(1400)
        continue
      }
      if (auth.status === 'checkpoint') {
        authentication.sawAuthenticationGate = true
        await currentPage.bringToFront().catch(() => {})
        hooks.onStep('checkpoint', auth.message ?? 'Authentication needs your review.', await safeShot(currentPage))
        const res = await hooks.requestCheckpoint({
          type: auth.checkpointType ?? 'password_or_sso',
          message: auth.message ?? 'Authentication needs your review.',
          autoResumeWhen: () => waitForAuthenticationCompletion(currentPage, ctx.job.url, hooks.isCancelled)
        })
        if (res.action === 'skip' || res.action === 'abort') {
          return { status: 'skipped', error: `Skipped at ${auth.checkpointType ?? 'password_or_sso'}` }
        }
        await currentPage.waitForTimeout(900)
        continue
      }

      const restored = await restoreApplicationAfterAuthentication(currentPage, ctx.job.url, authentication)
      if (restored) {
        currentPage = restored
        hooks.onStep('info', 'Sign-in confirmed — returning to the original job and continuing automatically.')
        await currentPage.waitForTimeout(900)
        continue
      }

      const loginIdentity = credentialMetadataForSite(currentPage.url(), ctx.profile.personal.email)
      const loginEmail = loginIdentity?.email ?? ctx.profile.personal.email
      if (await prefillAuthEmail(currentPage, loginEmail)) {
        hooks.onStep(
          'info',
          loginIdentity
            ? `Filled the saved ${loginIdentity.hostname} account email.`
            : 'Filled the application email. No protected credential is saved for this site.'
        )
      }

      // 1) Deterministic gate detection FIRST — never automate through these.
      const gate = await detectCheckpoint(currentPage, { allowGoogleSession: ctx.settings.reuseBrowserSession })
      if (gate) {
        const authenticationGate = gate.type === 'password_or_sso' || gate.type === 'account_creation'
        const captchaGate = gate.type === 'captcha'
        if (authenticationGate) authentication.sawAuthenticationGate = true
        await currentPage.bringToFront().catch(() => {})
        hooks.onStep('checkpoint', gate.message, await safeShot(currentPage))
        const res = await hooks.requestCheckpoint({
          type: gate.type,
          message: gate.message,
          autoResumeWhen: authenticationGate
            ? () => waitForAuthenticationCompletion(currentPage, ctx.job.url, hooks.isCancelled)
            : captchaGate
              ? () => waitForCaptchaCompletion(currentPage, hooks.isCancelled)
              : undefined
        })
        if (res.action === 'skip' || res.action === 'abort')
          return { status: 'skipped', error: 'Skipped at ' + gate.type }
        // user cleared the gate; re-observe and continue
        await currentPage.waitForTimeout(1000)
        continue
      }

      // 1b) If a stray click drifted us to an off-task site, go back.
      if (
        OFFTASK_HOSTS.some((h) => currentPage.url().includes(h)) &&
        !(settings.reuseBrowserSession && currentPage.url().includes('accounts.google.com')) &&
        normalizedHostname(currentPage.url()) !== normalizedHostname(ctx.job.url)
      ) {
        hooks.onStep('info', `Drifted to an off-task site — returning to the application.`)
        await currentPage.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
        await currentPage.waitForTimeout(800)
        continue
      }

      // 2) Observe
      const obs = await observe(currentPage)
      hooks.onStep('info', `Step ${step + 1}: ${obs.title || obs.url}`, obs.screenshot)

      // 3) Plan
      let plan: PlannedAction
      try {
        plan = (await knownStartPlan(currentPage, ctx.job, obs)) ??
          knownFieldPlan(ctx.profile, ctx.job, obs, completedFields, agentOnlyFields) ??
          knownChoicePlan(ctx.profile, obs) ??
          (await knownProgressPlan(currentPage, obs)) ??
          (await this.plan(ctx, obs, history))
        plannerFailures = 0
      } catch (e) {
        plannerFailures++
        const detail = e instanceof Error ? e.message : String(e)
        if (plannerFailures < 3) {
          const retryMessage = `Planner returned invalid output (${detail}). Re-observing the unchanged form and retrying automatically.`
          hooks.onStep('verify', retryMessage)
          history.push(retryMessage)
          await currentPage.waitForTimeout(500)
          continue
        }
        hooks.onStep('error', `Planner could not produce a valid action after automatic retries: ${detail}`)
        return { status: 'failed', error: 'Planner returned invalid output after retries' }
      }

      // normalize the ref: models sometimes return "#12" or "12" instead of 12
      plan.target = refNum(plan.target) ?? undefined

      let targetChoice = obs.elements.find((element) => element.ref === plan.target)
      // Models occasionally describe a searchable React Select as a text box
      // and emit `type`. It is still a finite-choice control: normalize the
      // action before logging or acting so we always choose a real option.
      if (
        plan.action === 'type' &&
        targetChoice &&
        (targetChoice.tag === 'select' || targetChoice.role === 'combobox' || targetChoice.options?.length) &&
        plan.text?.trim()
      ) {
        plan = {
          ...plan,
          action: 'select',
          value: plan.text,
          text: undefined,
          reason: `${plan.reason ?? ''} Normalized to option selection for a dropdown.`.trim()
        }
      }
      const conflict = choiceConflict(ctx.profile, targetChoice)
      if (conflict) {
        hooks.onStep('verify', conflict)
        history.push(conflict)
        continue
      }
      if (plan.action === 'click' && targetChoice?.option && targetChoice.checked) {
        const alreadySelected = `Skipped duplicate click: “${targetChoice.option}” is already selected for “${targetChoice.label ?? 'this question'}”.`
        hooks.onStep('verify', alreadySelected)
        history.push(alreadySelected)
        const start = await knownStartPlan(currentPage, ctx.job, obs)
        if (start && start.target !== plan.target) {
          plan = start
          targetChoice = obs.elements.find((element) => element.ref === plan.target)
        } else {
          stuck++
          if (stuck >= 4 && /linkedin\.com$/i.test(normalizedHostname(currentPage.url()))) {
            hooks.onStep('verify', 'A selected LinkedIn filter was repeated — reloading the exact pasted job before rescanning Easy Apply.')
            await currentPage.goto(ctx.job.url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {})
            await currentPage.waitForTimeout(900)
            stuck = 0
          } else {
            await currentPage.mouse.wheel(0, 450)
            await currentPage.waitForTimeout(300)
          }
          continue
        }
      }
      const plannedValue = plan.action === 'select' ? plan.value : plan.action === 'type' ? plan.text : undefined
      if (
        (plan.action === 'type' || plan.action === 'select' || plan.action === 'upload') &&
        targetChoice?.value?.trim() &&
        (plan.action === 'upload' || valuesEquivalent(targetChoice.value, plannedValue))
      ) {
        const alreadyFilled = `Skipped duplicate ${plan.action}: “${cleanQuestion(targetChoice.label)}” already contains “${trunc(targetChoice.value)}”.`
        hooks.onStep('verify', alreadyFilled)
        history.push(alreadyFilled)
        const progress = await knownProgressPlan(currentPage, obs)
        if (!progress) {
          stuck++
          await currentPage.mouse.wheel(0, 500)
          await currentPage.waitForTimeout(350)
          continue
        }
        plan = progress
        targetChoice = obs.elements.find((element) => element.ref === plan.target)
      }
      if (
        plan.action === 'type' &&
        targetChoice &&
        /\blocation\b|\bcity\b/i.test(`${targetChoice.label ?? ''} ${targetChoice.name ?? ''}`) &&
        /^https?:\/\//i.test(plan.text ?? '')
      ) {
        const rejected = `Rejected an invalid URL answer for the location field “${cleanQuestion(targetChoice.label)}”.`
        hooks.onStep('verify', rejected)
        history.push(rejected)
        continue
      }
      hooks.onStep('plan', `${plan.action}${plan.target != null ? ` #${plan.target}` : ''} — ${plan.reason ?? ''}`)

      // 4) Act
      const cont = await this.act(currentPage, plan, ctx, history, targetChoice)
      if (cont.outcome) return cont.outcome
      if (cont.page) currentPage = cont.page
      history.push(cont.record)

      const actedField = fieldIdentity(targetChoice)
      if (actedField && ['type', 'select', 'upload'].includes(plan.action)) {
        if (/failed|no-op|not ready|no confirmation/i.test(cont.record)) {
          // A deterministic attempt gets one chance. From here the visual
          // planner sees the failure and chooses a different interaction.
          agentOnlyFields.add(actedField)
        } else {
          // Some controlled widgets intentionally display a transformed value
          // (for example “India” becomes “+91”). Remember the verified action
          // instead of reapplying the saved source string forever.
          completedFields.add(actedField)
        }
      }

      // A generic model click may itself be the submit action. Confirm success
      // before incrementing the stuck counter and entering automatic recovery.
      if (await verifySubmitted(currentPage)) {
        hooks.onStep('info', 'Submission confirmed — application completed successfully.')
        const shot = await this.capture(currentPage, ctx.job)
        return { status: 'submitted', screenshotPath: shot }
      }

      // 5) Stuck guard — don't retry the same failing action, or oscillate, forever
      if (/failed|no-op|not ready|no confirmation/i.test(cont.record)) stuck++
      else stuck = 0
      const semanticTarget = cleanQuestion(targetChoice?.label || targetChoice?.id || String(plan.target ?? ''))
        .toLowerCase()
      const answer = (plan.value ?? plan.text ?? targetChoice?.option ?? '').trim().toLowerCase().slice(0, 80)
      const sig = `${plan.action}:${semanticTarget}:${answer}`
      recent.push(sig)
      if (recent.length > 8) recent.shift()
      if (recent.filter((s) => s === sig).length >= 3) stuck = Math.max(stuck, 4) // oscillation
      if (stuck >= 4) {
        hooks.onStep('verify', 'Detected repeated actions — recovering automatically by re-scanning the next section.')
        await currentPage.mouse.wheel(0, 650)
        recent.length = 0
        stuck = 0
        history.push('automatic recovery: scrolled and invalidated repeated targets')
      }
      await currentPage.waitForTimeout(600)
    }

    hooks.onStep('error', 'Reached the automatic step limit without a verified submission.')
    return { status: 'failed', error: 'Automatic step limit reached; retry after reviewing Profile completeness.' }
  }

  /** Ask the model for the next atomic action. */
  private async plan(ctx: ApplyContext, obs: Observation, history: string[]): Promise<PlannedAction> {
    const els = obs.elements
      .map((e) => {
        const parts = [
          `#${e.ref}`,
          e.tag + (e.type ? `[${e.type}]` : ''),
          e.id ? `id="${e.id}"` : '',
          e.label ? `q="${e.label}"` : '',
          e.option ? `option="${e.option}"` : '',
          e.checked != null ? (e.checked ? 'CHECKED' : 'unchecked') : '',
          e.placeholder ? `ph="${e.placeholder}"` : '',
          e.name ? `name="${e.name}"` : '',
          e.text ? `text="${e.text}"` : '',
          e.value ? `value="${e.value}"` : '',
          e.options?.length ? `options="${e.options.join(' | ')}"` : '',
          e.required ? 'REQUIRED' : ''
        ].filter(Boolean)
        return parts.join(' ')
      })
      .join('\n')

    const googleSessionRule = ctx.settings.reuseBrowserSession
      ? 'You MAY click Continue/Sign in with Google and select an already signed-in account. NEVER type a password or approve a new OAuth permission screen; emit a password_or_sso checkpoint for those.'
      : 'You must NOT complete Google/SSO sign-in; emit a password_or_sso checkpoint when it is required.'

    const system = `You are an agent filling a job application form. You issue ONE atomic action at a time as JSON.
Use the applicant facts to fill fields. NEVER invent data not in the facts — if a required field has no matching fact, use action "answer_needed". Leave unknown optional identity fields blank and keep progressing; never request manual takeover for an optional field.
You must NOT try to solve CAPTCHAs, create passwords, or enter passwords. ${googleSessionRule}
When the form is fully filled and the only thing left is to submit, use action "checkpoint" with checkpointType "final_submit" (auto-submit settings are applied by the app).

IMPORTANT RULES:
- "target" MUST be the integer ref of the element (e.g. 12), NOT "#12".
- The pasted JOB URL is an explicit application target. Apply to that selected job only. Never edit a job-search query/filter, search for a different role, or reject the target because it differs from the applicant's preferred role.
- If a cookie/consent banner is present, dismiss it FIRST — prefer "Reject" / "Reject all" / decline non-essential over "Accept". A banner often overlays and blocks other buttons.
- If your PREVIOUS action failed (see recent actions), DO NOT repeat the same target. Try a different element, scroll to reveal it, or pick another approach.
- Prefer clicking a visible "Apply"/"Apply now" control to open the form before trying to fill fields.
- ALWAYS upload the resume: if you see a Resume/CV or file field, use action "upload" on it. This is almost always REQUIRED.
- Fill EVERY field marked required (its label usually ends with "*"), including "Current location". Use the applicant facts; for location use the "Current location" fact.
- WRITE ANSWERS YOURSELF. For free-text / screening questions (textarea or text input like "Why do you want to work here?", "Describe your experience"), compose a concise, professional 2-4 sentence answer FROM THE APPLICANT FACTS and use action "type". Do NOT ask the user. Only use "answer_needed" as a last resort for a question needing personal info truly absent from the facts — and even then, put your best draft in "suggested".
- TECHNICAL ANSWERS: be concrete and senior-level. Name the applicant's actual architectures, languages, frameworks, cloud services, data stores, deployment approach, ownership, and measured outcomes from the facts. For AI/LLM/RAG/agent questions, explain the system boundary, retrieval/model/tooling pipeline, evaluation or observability, production deployment, and user impact when those facts exist. Avoid generic enthusiasm, vague claims, and repeated boilerplate. Never invent a technology or metric.
- OPTIONAL PROFESSIONAL FIELDS: before final_submit, fill blank optional textareas or text inputs asking for additional information, motivation, interest, qualifications, relevant experience, a cover note, or anything else the hiring team should know. Write a tailored, positive 2-4 sentence response using only applicant facts. Do not leave these blank merely because they are optional.
- VOLUNTARY/SENSITIVE FIELDS: do not invent answers for demographic self-identification, disability, veteran status, race/ethnicity, gender, age/date of birth, salary history, criminal history, government IDs, or referral-source questions. Use saved facts when present; otherwise leave optional fields blank.
- Do NOT click navigation, header/footer, "Sign in", "Apply with LinkedIn", social, or any link that leaves the application form. Stay on the application page and fill it. Never open external/random links.
- RADIO/CHECKBOX: each option shows q="<the group question>", option="Yes/No/…", and CHECKED or unchecked. Pick the option that matches the facts and click it ONCE. If the correct option is ALREADY "CHECKED", do NOT click it again — move to the next unanswered field. Never toggle a group back and forth.
- SELECT/COMBOBOX: use action "select", never "type". The engine first inspects and clicks the best existing option, then opens a collapsed finite menu; it types only for genuine search/typeahead controls when no options exist yet. A React combobox's inner input may be empty after selection; trust its reported value="..." and do not select it again.
- WORK AUTHORIZATION: read each question independently and use the exact profile facts. "Authorized to work" and "requires sponsorship" are different questions and may have different answers. Never invert one to infer the other.
- PERSONAL PREFERENCES: never infer willingness to relocate, commute, travel, or work onsite from the applicant's current location. If the exact preference is absent and required, use answer_needed with no invented suggestion; if optional, leave it blank and continue.
- MULTI-STEP FORMS: an empty optional middle name, suffix, demographic field, or other optional identity field never blocks Next/Continue. Do not revisit a field that already has a value.
- Do NOT emit a final_submit checkpoint until every required field is filled AND the resume is attached. If the system tells you "NOT READY to submit", fill the listed fields first — do not retry submit.

Action schema (return exactly one JSON object):
{"action":"type","target":<integer ref like 12>,"text":"...","reason":""}
{"action":"select","target":<integer ref>,"value":"...","reason":""}   // value = option text or value
{"action":"click","target":<integer ref>,"reason":""}
{"action":"upload","target":<integer ref>,"file":"resume","reason":""}
{"action":"scroll","direction":"down","reason":""}
{"action":"navigate","url":"...","reason":""}  // e.g. click-through to an "Apply" page
{"action":"answer_needed","target":<integer ref>,"question":"...","suggested":"...","confidence":0.0-1.0,"reason":""}
{"action":"checkpoint","checkpointType":"final_submit","reason":""}
{"action":"done","success":true,"reason":""}  // only if already submitted/confirmation shown`

    const user = `APPLICANT FACTS:\n${profileFacts(ctx.profile)}\n
JOB: ${ctx.job.title} @ ${ctx.job.company}\n
JOB DESCRIPTION (tailor technical answers to this, without copying it):\n${ctx.job.jdText.slice(0, 7000) || '(not available)'}\n
CURRENT PAGE: ${obs.url}\nTITLE: ${obs.title}\n
INTERACTIVE ELEMENTS:\n${els || '(none found)'}\n
BLANK OPTIONAL PROFESSIONAL TEXT FIELDS (fill these before submitting):\n${blankOptionalProfessionalFields(obs).join('\n') || '(none)'}\n
RECENT ACTIONS:\n${history.slice(-8).join('\n') || '(none yet)'}\n
Return the single best next action as JSON.`

    const messages: Msg[] = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${user}\n\nRENDERED PAGE: The attached screenshot is the same state as the numbered DOM elements. Use it to distinguish the application dialog or selected-job pane from search filters, navigation, overlays, and background controls. DOM refs remain the authoritative action targets.`
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${obs.screenshot.toString('base64')}`,
              detail: 'auto'
            }
          }
        ]
      }
    ]

    let invalidOutput = ''
    let invalidReason = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const retryInstruction = attempt === 0
        ? []
        : [
            {
              role: 'assistant' as const,
              content: invalidOutput.slice(0, 2000)
            },
            {
              role: 'user' as const,
              content: `That response was not valid JSON (${invalidReason}). Return the same single next action again as one complete, valid JSON object. Do not include Markdown or commentary.`
            }
          ]
      const raw = await chatForTask('loop', [...messages, ...retryInstruction], {
        json: true,
        maxTokens: 750,
        temperature: 0,
        onUsage: ctx.hooks.onUsage
      })

      try {
        return validatePlannedAction(parseJson<unknown>(raw))
      } catch (error) {
        invalidOutput = raw
        invalidReason = error instanceof Error ? error.message : String(error)
        if (attempt === 0) {
          ctx.hooks.onStep('verify', `Planner response was malformed (${invalidReason}); correcting it automatically.`)
        }
      }
    }

    throw new Error(invalidReason || 'Model returned invalid planner JSON')
  }

  private async act(
    page: Page,
    plan: PlannedAction,
    ctx: ApplyContext,
    _history: string[],
    target?: Observation['elements'][number]
  ): Promise<{ record: string; outcome?: ApplyOutcome; page?: Page }> {
    const { hooks, settings } = ctx
    const bySel = (ref: number | string) => {
      if (target?.id) {
        const stable = page.locator(`[id="${escapeAttribute(target.id)}"]`).first()
        return stable
      }
      return page.locator(`[data-auta-ref="${refNum(ref)}"]`).first()
    }

    try {
      switch (plan.action) {
        case 'type': {
          if (plan.target == null || plan.text == null) break
          await smartFill(
            page,
            bySel(plan.target),
            plan.text,
            dropdownReviewer(ctx, target, plan.text)
          )
          return { record: `typed "${trunc(plan.text)}" into #${plan.target}` }
        }
        case 'select': {
          if (plan.target == null) break
          const loc = bySel(plan.target)
          await smartSelect(
            page,
            loc,
            plan.value ?? '',
            dropdownReviewer(ctx, target, plan.value ?? '')
          )
          return { record: `selected "${plan.value}" in #${plan.target}` }
        }
        case 'upload': {
          if (plan.target == null || !ctx.resumePath) {
            hooks.onStep('error', 'Resume upload requested but no resume file on record.')
            return { record: 'upload skipped (no resume file)' }
          }
          await bySel(plan.target).setInputFiles(ctx.resumePath, { timeout: 8000 })
          return { record: `uploaded resume to #${plan.target}` }
        }
        case 'click': {
          if (plan.target == null) break
          const clickTarget = bySel(plan.target)
          const binaryInput =
            target?.tag === 'input' &&
            ['radio', 'checkbox'].includes((target.type ?? '').toLowerCase())
          if (binaryInput) {
            // Labels and decorative wrappers often sit above the native input.
            // `check` updates the semantic state and dispatches input/change
            // events without depending on the input's clickable pixel area.
            await clickTarget.check({ timeout: 8000, force: true })
            await page.waitForTimeout(350)
            return { record: `checked #${plan.target}` }
          }
          const popupPromise = Promise.race([
            page.context().waitForEvent('page'),
            page.waitForTimeout(500).then(() => null)
          ]).catch(() => null)
          await clickTarget.click({ timeout: 8000 })
          const popup = await popupPromise
          const targetDescription = `${target?.label ?? ''} ${target?.text ?? ''} ${target?.id ?? ''}`
          if (isLinkedInUrl(page.url()) && /easy apply/i.test(targetDescription)) {
            await page
              .locator('[data-test-modal-id="easy-apply-modal"][aria-hidden="false"]')
              .waitFor({ state: 'attached', timeout: 8000 })
              .catch(() => {})
          }
          await page.waitForTimeout(500)
          if (popup) {
            await popup.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
            return { record: `clicked #${plan.target} and followed sign-in window`, page: popup }
          }
          return { record: `clicked #${plan.target}` }
        }
        case 'navigate': {
          if (!plan.url) break
          if (!sameExplicitTarget(plan.url, ctx.job.url)) {
            throw new Error('Refused a guessed navigation URL; only the exact selected job may be reloaded.')
          }
          await page.goto(plan.url, { waitUntil: 'domcontentloaded' }).catch(() => {})
          return { record: `navigated to ${plan.url}` }
        }
        case 'scroll': {
          await page.mouse.wheel(0, plan.direction === 'up' ? -700 : 700)
          return { record: `scrolled ${plan.direction ?? 'down'}` }
        }
        case 'answer_needed': {
          // Autonomy first: use a grounded draft when one exists. Optional
          // unknown fields stay blank; required unknown facts fail clearly so
          // the user can complete Profile once instead of taking over mid-run.
          if (plan.suggested && plan.suggested.trim() && plan.target != null) {
            await smartFill(page, bySel(plan.target), plan.suggested)
            return { record: `auto-answered #${plan.target}: ${trunc(plan.suggested)}` }
          }
          if (!target?.required) {
            return { record: `left optional unknown field blank: ${cleanQuestion(plan.question || target?.label)}` }
          }
          const question = cleanQuestion(plan.question || target?.label || 'required application field')
          hooks.onStep('error', `Profile is missing a required fact for “${question}”.`)
          return {
            record: 'required profile fact missing',
            outcome: { status: 'failed', error: `Complete Profile field for: ${question}` }
          }
        }
        case 'checkpoint': {
          const t = plan.checkpointType ?? 'final_submit'

          if (t === 'final_submit') {
            // Completeness gate — never submit while required fields are empty.
            const missing = await findIncompleteRequired(page)
            if (missing.length) {
              return {
                record: `NOT READY to submit — required fields still empty: ${missing.join(', ')}. Fill these (and attach the resume) before submitting.`
              }
            }

            const doSubmit = async (): Promise<{ record: string; outcome?: ApplyOutcome }> => {
              await this.clickSubmit(page)
              await page.waitForTimeout(3000)
              // A protected verification gate can appear only at submit time.
              const gate = await detectCheckpoint(page, { allowGoogleSession: settings.reuseBrowserSession })
              if (gate) {
                hooks.onStep('checkpoint', gate.message, await safeShot(page))
                const gr = await hooks.requestCheckpoint({
                  type: gate.type,
                  message: gate.message,
                  autoResumeWhen: gate.type === 'captcha'
                    ? () => waitForCaptchaCompletion(page, hooks.isCancelled)
                    : undefined
                })
                if (gr.action === 'skip' || gr.action === 'abort')
                  return { record: 'skipped at submit-time gate', outcome: { status: 'skipped', error: `Skipped at ${gate.type}` } }
                await page.waitForTimeout(1500)
              }
              if (await verifySubmitted(page)) {
                const shot = await this.capture(page, ctx.job)
                return { record: 'submitted ✓', outcome: { status: 'submitted', screenshotPath: shot } }
              }
              // click didn't land a confirmation — likely a validation error; loop again
              return { record: 'submit attempted but no confirmation yet — re-checking the form' }
            }

            if (settings.autoSubmit) {
              hooks.onStep('info', 'Form complete — auto-submitting.')
              return await doSubmit()
            }
            const res = await hooks.requestCheckpoint({
              type: 'final_submit',
              message: plan.message ?? 'Form looks complete — review and submit.'
            })
            if (res.action === 'submit') return await doSubmit()
            if (res.action === 'skip' || res.action === 'abort')
              return { record: 'skipped at submit', outcome: { status: 'skipped', error: 'Skipped at submit' } }
            return { record: 'resumed after submit checkpoint' }
          }

          // non-submit checkpoints raised explicitly by the planner
          const res = await hooks.requestCheckpoint({
            type: t,
            message: plan.message ?? 'Human step required.',
            autoResumeWhen: t === 'captcha' ? () => waitForCaptchaCompletion(page, hooks.isCancelled) : undefined
          })
          if (res.action === 'skip' || res.action === 'abort')
            return { record: 'skipped at checkpoint', outcome: { status: 'skipped', error: `Skipped at ${t}` } }
          return { record: `resumed after ${t}` }
        }
        case 'done': {
          if (plan.success && !(await verifySubmitted(page))) {
            return {
              record: 'done rejected — no visible submission confirmation; continuing verification'
            }
          }
          const shot = await this.capture(page, ctx.job)
          return {
            record: 'done',
            outcome: { status: plan.success ? 'submitted' : 'failed', screenshotPath: shot, error: plan.success ? undefined : plan.reason }
          }
        }
      }
    } catch (e) {
      hooks.onStep('error', `Action failed: ${e instanceof Error ? e.message : e}`)
      return { record: `action ${plan.action} failed` }
    }
    return { record: `no-op (${plan.action})` }
  }

  private async clickSubmit(page: Page): Promise<void> {
    const candidates = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Submit application")',
      'button:has-text("Submit")',
      'button:has-text("Apply")'
    ]
    for (const sel of candidates) {
      const loc = page.locator(sel).first()
      if (await loc.count()) {
        await loc.click({ timeout: 6000 }).catch(() => {})
        return
      }
    }
  }

  private async capture(page: Page, job: Job): Promise<string | undefined> {
    // Let the success page finish its last paint before freezing the receipt;
    // the browser context closes as soon as this engine returns.
    await page.waitForTimeout(700).catch(() => {})
    const file = join(paths.screenshots(), `${sanitize(job.company || 'app')}-${randomUUID().slice(0, 8)}.png`)
    const buf = await page.screenshot({ fullPage: true }).catch(() => null)
    if (!buf) return undefined
    writeFileSync(file, buf)
    return file
  }
}

async function safeShot(page: Page): Promise<Buffer | undefined> {
  return page.screenshot({ type: 'png' }).catch(() => undefined)
}

/** Fill only the non-secret email field when an authentication form is open. */
async function prefillAuthEmail(page: Page, email: string): Promise<boolean> {
  if (!email.trim()) return false
  try {
    const password = page.locator('input[type="password"]:visible').first()
    if ((await password.count()) === 0) return false
    const emailField = page
      .locator(
        'input[type="email"]:visible, input[autocomplete="username"]:visible, input[name*="email" i]:visible, input[id*="email" i]:visible'
      )
      .first()
    if ((await emailField.count()) === 0 || (await emailField.inputValue()).trim()) return false
    await emailField.fill(email, { timeout: 4000 })
    return true
  } catch {
    return false
  }
}

function normalizedHostname(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    // LinkedIn moves public job URLs between regional, www, and bare hosts
    // while preserving the same job id and authenticated session.
    if (hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com')) return 'linkedin.com'
    return hostname
  } catch {
    return ''
  }
}

function hasAuthenticationActivity(state: AuthenticationState): boolean {
  return state.sawAuthenticationGate ||
    state.googleAttempts.size > 0 ||
    state.passwordAttempts.size > 0 ||
    state.signupAttempts.size > 0
}

async function isAuthenticationWall(page: Page): Promise<boolean> {
  if (page.isClosed()) return true
  const passwordVisible = await page.locator('input[type="password"]:visible').count().catch(() => 0)
  if (passwordVisible > 0) return true
  let path = ''
  try {
    path = new URL(page.url()).pathname.toLowerCase()
  } catch {
    return true
  }
  if (/(^|\/)(login|log-in|signin|sign-in|signup|sign-up|register|auth)(\/|$)/i.test(path)) return true
  const text = await page.locator('body').innerText({ timeout: 1200 }).catch(() => '')
  return /^(?:\s)*(sign in|log in|create (?:an )?account|join now)(?:\s|$)/i.test(text.slice(0, 500))
}

async function selectBestAuthenticationPage(current: Page, jobUrl: string): Promise<Page> {
  const jobHost = normalizedHostname(jobUrl)
  const pages = current.context().pages().filter((candidate) => !candidate.isClosed())
  let best = current
  let bestScore = -Infinity
  for (const candidate of pages) {
    const url = candidate.url()
    const sameSite = normalizedHostname(url) === jobHost
    const authWall = await isAuthenticationWall(candidate)
    let score = candidate === current ? 2 : 0
    if (sameSite) score += 100
    if (!authWall) score += 40
    if (/\/jobs?(?:\/|$)/i.test(safePathname(url))) score += 12
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

async function waitForAuthenticationCompletion(
  page: Page,
  jobUrl: string,
  isCancelled: () => boolean,
  timeoutMs = 5 * 60_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  const jobHost = normalizedHostname(jobUrl)
  let stableUrl = ''
  let stableChecks = 0
  while (Date.now() < deadline && !isCancelled()) {
    const candidates = page.context().pages().filter(
      (candidate) => !candidate.isClosed() && normalizedHostname(candidate.url()) === jobHost
    )
    let clearPage: Page | undefined
    for (const candidate of candidates) {
      if (await isAuthenticationWall(candidate)) continue
      const bodyLength = await candidate.locator('body').innerText({ timeout: 1200 })
        .then((text) => text.trim().length)
        .catch(() => 0)
      if (bodyLength >= 40) {
        clearPage = candidate
        break
      }
    }
    const candidateUrl = clearPage?.url() ?? ''
    if (candidateUrl && candidateUrl === stableUrl) stableChecks++
    else {
      stableUrl = candidateUrl
      stableChecks = candidateUrl ? 1 : 0
    }
    if (stableChecks >= 2) return true
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  return false
}

/**
 * Watch a visible CAPTCHA without interacting with it. Once the challenge has
 * disappeared for two consecutive checks, the checkpoint resolves and the
 * application continues automatically from the same page.
 */
async function waitForCaptchaCompletion(
  page: Page,
  isCancelled: () => boolean,
  timeoutMs = 5 * 60_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  let clearChecks = 0
  while (Date.now() < deadline && !isCancelled() && !page.isClosed()) {
    const gate = await detectCheckpoint(page).catch(() => null)
    if (gate?.type === 'captcha') clearChecks = 0
    else clearChecks++
    if (clearChecks >= 2) return true
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  return false
}

async function restoreApplicationAfterAuthentication(
  page: Page,
  jobUrl: string,
  state: AuthenticationState
): Promise<Page | null> {
  if (!hasAuthenticationActivity(state) || state.restoredApplication) return null
  if (normalizedHostname(page.url()) !== normalizedHostname(jobUrl)) return null
  if (await isAuthenticationWall(page)) return null
  const current = withoutHash(page.url())
  const target = withoutHash(jobUrl)
  if (current === target) {
    state.restoredApplication = true
    return null
  }
  state.restoredApplication = true
  await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {})
  return page
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return ''
  }
}

function withoutHash(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return url
  }
}

function sameExplicitTarget(candidate: string, selectedJob: string): boolean {
  try {
    const left = new URL(candidate)
    const right = new URL(selectedJob)
    const trim = (pathname: string): string => pathname.replace(/\/+$/, '') || '/'
    return normalizedHostname(left.toString()) === normalizedHostname(right.toString()) &&
      trim(left.pathname) === trim(right.pathname)
  } catch {
    return false
  }
}

/** Select native selects and React/typeahead comboboxes through their real option UI. */
type ChoiceReviewer = (labels: string[]) => Promise<string | null>

async function smartSelect(
  page: Page,
  locator: Locator,
  value: string,
  reviewChoice?: ChoiceReviewer
): Promise<void> {
  const tag = await locator.evaluate((element) => element.tagName.toLowerCase()).catch(() => '')
  if (tag === 'select') {
    const labels = await locator.locator('option').allTextContents()
    const chosen = bestOption(value, labels)
    if (!chosen) throw new Error(`No matching option for “${value}”`)
    await locator.selectOption({ label: chosen })
    return
  }
  await smartComboboxSelect(page, locator, value, reviewChoice)
}

/**
 * Robust field fill that survives autocomplete/typeahead widgets (for example
 * Greenhouse React Select and Lever/Google Places). A real suggestion must be
 * selected; writing text into a controlled combobox is not considered success.
 */
async function smartFill(
  page: Page,
  locator: Locator,
  value: string,
  reviewChoice?: ChoiceReviewer
): Promise<void> {
  const isCombobox = await locator
    .evaluate(
      (element) =>
        element.getAttribute('role') === 'combobox' ||
        element.getAttribute('aria-autocomplete') === 'list'
    )
    .catch(() => false)
  if (isCombobox) {
    await smartComboboxSelect(page, locator, value, reviewChoice)
    return
  }

  await locator.scrollIntoViewIfNeeded().catch(() => {})
  await locator.click({ timeout: 6000 }).catch(() => {})
  await locator.fill('').catch(() => {})
  await locator
    .pressSequentially(value, { delay: 40, timeout: 8000 })
    .catch(async () => {
      await locator.fill(value).catch(() => {})
    })

  // Autocomplete (Lever/Greenhouse location = Google Places, and similar): the
  // field REJECTS free text — a suggestion must be selected. The dropdown loads
  // asynchronously after typing, so wait for it, then select. Keyboard first
  // (clicking blurs the input and closes the list), then click as a fallback.
  const dropdownSel =
    '.pac-container .pac-item:visible, [role="listbox"] [role="option"]:visible, [role="listbox"] li:visible, ul[class*="result" i] li:visible, ul[class*="suggest" i] li:visible, .dropdown-menu li:visible, .dropdown-results li:visible, .aa-suggestion:visible, .select__option:visible'
  let hasDropdown = false
  try {
    await page.locator(dropdownSel).first().waitFor({ state: 'visible', timeout: 4500 })
    hasDropdown = true
  } catch {
    /* no suggestions appeared */
  }

  if (hasDropdown) {
    await locator.press('ArrowDown').catch(() => {})
    await page.waitForTimeout(250)
    await locator.press('Enter').catch(() => {})
    await page.waitForTimeout(450)
    let v = await locator.inputValue().catch(() => '')
    if (v.trim()) return
    // keyboard didn't take → click the first visible suggestion
    const visibleOptions = page.locator(dropdownSel)
    const labels = await visibleOptions.allTextContents().catch(() => [])
    const selected = bestOption(value, labels)
    const opt = selected ? visibleOptions.filter({ hasText: selected }).first() : visibleOptions.first()
    try {
      if ((await opt.count()) > 0 && (await opt.isVisible())) {
        await opt.click({ timeout: 2500 }).catch(() => {})
        await page.waitForTimeout(350)
        v = await locator.inputValue().catch(() => '')
        if (v.trim()) return
      }
    } catch {
      /* fall through */
    }
  }

  // 3) Plain field the widget cleared → set the value the React-controlled way.
  const stuck = await locator.inputValue().catch(() => '')
  if (!stuck.trim()) {
    await locator
      .evaluate((el, v) => {
        const input = el as HTMLInputElement
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        if (setter) setter.call(input, v)
        else input.value = v
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        input.blur()
      }, value)
      .catch(() => {})
  }
}

async function smartComboboxSelect(
  page: Page,
  locator: Locator,
  value: string,
  reviewChoice?: ChoiceReviewer
): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => {})
  await locator.click({ timeout: 6000 })
  let options = await comboboxOptions(page, locator)
  await options.first().waitFor({ state: 'visible', timeout: 900 }).catch(() => {})

  // Finite dropdowns (Yes/No, EEO, veteran, disability, etc.) expose all of
  // their choices immediately. Click the matching option without typing.
  if (await clickBestOption(options, value, locator, page)) return
  if (await chooseReviewedVisibleOption(options, reviewChoice, locator, page)) return
  if ((await options.count()) > 0) {
    throw new Error(`None of the visible options safely matched “${value}”`)
  }

  // Greenhouse keeps finite menus collapsed when the search input itself is
  // clicked. ArrowDown opens the existing option list without entering text or
  // committing the highlighted item; we then click the semantic match below.
  await locator.press('ArrowDown').catch(() => {})
  await page.waitForTimeout(150)
  options = await comboboxOptions(page, locator)
  await options.first().waitFor({ state: 'visible', timeout: 900 }).catch(() => {})
  if (await clickBestOption(options, value, locator, page)) return
  if (await chooseReviewedVisibleOption(options, reviewChoice, locator, page)) return
  if ((await options.count()) > 0) {
    throw new Error(`None of the visible options safely matched “${value}”`)
  }

  // Only genuine search/typeahead widgets need filter text (city, country,
  // large location catalogs). Re-read the menu because React may replace it.
  await locator.fill('').catch(() => {})
  await locator
    .pressSequentially(value, { delay: 35, timeout: 9000 })
    .catch(async () => locator.fill(value))
  options = await comboboxOptions(page, locator)
  await options.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  if (await clickBestOption(options, value, locator, page)) return
  if (await chooseReviewedVisibleOption(options, reviewChoice, locator, page)) return

  // A small class of autocomplete inputs accepts arbitrary text when its
  // provider returns no suggestions. Blur once and accept the text only if the
  // control itself retains it. Strict React Select fields clear the query here,
  // so they still fail safely rather than pretending an option was selected.
  if ((await options.count()) === 0) {
    await locator.press('Tab').catch(() => {})
    await page.waitForTimeout(250)
    const retained = await controlValue(locator)
    if (normalizeComparable(retained) === normalizeComparable(value)) return
  }

  // Never press ArrowDown/Enter blindly: when filtering found no semantic
  // match, that would silently choose the first (and possibly contradictory)
  // option in the list.
  throw new Error(`Could not select a visible option for “${value}”`)
}

async function comboboxOptions(page: Page, locator: Locator): Promise<Locator> {
  const controlledId = await locator.getAttribute('aria-controls').catch(() => null)
  const selector = controlledId
    ? `[id="${escapeAttribute(controlledId)}"] [role="option"]:visible`
    : '[role="listbox"] [role="option"]:visible, .select__menu .select__option:visible, .pac-container .pac-item:visible, ul[class*="suggest" i] li:visible, ul[class*="result" i] li:visible'
  return page.locator(selector)
}

async function clickBestOption(
  options: Locator,
  requested: string,
  control: Locator,
  page: Page
): Promise<boolean> {
  const labels = await options.allTextContents().catch(() => [])
  const chosen = bestOption(requested, labels)
  if (!chosen) return false
  return clickNamedOption(options, chosen, control, page)
}

async function chooseReviewedVisibleOption(
  options: Locator,
  reviewChoice: ChoiceReviewer | undefined,
  control: Locator,
  page: Page
): Promise<boolean> {
  if (!reviewChoice || (await options.count()) === 0) return false
  const labels = (await options.allTextContents().catch(() => []))
    .map((label) => label.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (!labels.length) return false
  const reviewed = await reviewChoice(labels)
  if (!reviewed) return false
  const exact = labels.find((label) => normalizeComparable(label) === normalizeComparable(reviewed))
  if (!exact) return false
  return clickNamedOption(options, exact, control, page)
}

async function clickNamedOption(
  options: Locator,
  chosen: string,
  control: Locator,
  page: Page
): Promise<boolean> {
  const normalizedChoice = normalizeComparable(chosen)
  const count = await options.count()
  for (let index = 0; index < count; index++) {
    const option = options.nth(index)
    const text = normalizeComparable(await option.textContent().catch(() => ''))
    if (text !== normalizedChoice) continue
    await option.scrollIntoViewIfNeeded().catch(() => {})
    await option.click({ timeout: 3500 }).catch(async () => {
      // Portalled React Select menus can move between pointer-down and click.
      // Re-resolve the exact semantic option once and force that same option;
      // never fall back to an arbitrary first result.
      const refreshed = page.getByRole('option', { name: chosen, exact: true }).first()
      await refreshed.click({ timeout: 2500, force: true })
    })
    await page.waitForTimeout(300)
    const committed = await controlValue(control)
    if (committed) return true
    // React Select clears its search input after a successful choice. If the
    // exact option click closed the menu, that is also a committed selection;
    // treating the now-empty input as failure made the old code type into it.
    if (!(await option.isVisible().catch(() => false))) return true
    return (await option.getAttribute('aria-selected').catch(() => null)) === 'true'
  }
  return false
}

async function controlValue(locator: Locator): Promise<string> {
  return locator
    .evaluate((element) => {
      const input = element as HTMLInputElement
      const control =
        element.closest('.select__control, [class*="-control"], [class*="control"]') ||
        element.parentElement?.parentElement ||
        element.parentElement
      const scope = control?.parentElement || control
      const selected = scope?.querySelector(
        '.select__single-value, [class*="singleValue" i], [class*="single-value" i], [data-value]'
      )
      const hidden = scope?.querySelector('input[type="hidden"]') as HTMLInputElement | null
      return (
        element.getAttribute('aria-valuetext') ||
        selected?.textContent ||
        hidden?.value ||
        input.value ||
        ''
      ).replace(/\s+/g, ' ').trim()
    })
    .catch(() => '')
}

function bestOption(requested: string, labels: string[]): string | null {
  const request = normalizeComparable(requested)
  const requestFamily = semanticOptionFamily(request)
  let best: { label: string; score: number } | null = null
  for (const rawLabel of labels) {
    const label = rawLabel.replace(/\s+/g, ' ').trim()
    const comparable = normalizeComparable(label)
    if (!comparable) continue
    let score = 0
    if (comparable === request) score = 100
    else if (semanticOptionFamily(comparable) === requestFamily && requestFamily) score = 90
    else if (comparable.startsWith(request) || request.startsWith(comparable)) score = 75
    else if (comparable.includes(request) || request.includes(comparable)) score = 65
    else {
      const requestTokens = new Set(request.split(' ').filter((token) => token.length > 2))
      const optionTokens = new Set(comparable.split(' ').filter((token) => token.length > 2))
      const overlap = [...requestTokens].filter((token) => optionTokens.has(token)).length
      score = requestTokens.size ? (overlap / requestTokens.size) * 60 : 0
    }
    if (!best || score > best.score) best = { label, score }
  }
  return best && best.score >= 25 ? best.label : null
}

function normalizeComparable(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function semanticOptionFamily(value: string): string {
  if (
    /decline|prefer not|do not wish|dont wish|not wish|do not want|dont want|choose not|not answer|self identify/.test(value)
  ) return 'decline'
  if (/^(yes|y|true)(\b|$)/.test(value)) return 'yes'
  if (/^(no|n|false)(\b|$)/.test(value)) return 'no'
  if (/not (?:a )?protected veteran|not protected veteran/.test(value)) return 'no'
  if (/identify as .*protected veteran|classifications? of (?:a )?protected veteran/.test(value)) return 'yes'
  return ''
}

function dropdownReviewer(
  ctx: ApplyContext,
  target: Observation['elements'][number] | undefined,
  requested: string
): ChoiceReviewer {
  return async (labels) => {
    const question = cleanQuestion(
      target?.label || target?.name || target?.placeholder || 'dropdown field'
    )
    ctx.hooks.onStep('verify', `Reviewing ${labels.length} visible options for “${question}”.`)
    try {
      const raw = await chatForTask('loop', [
        {
          role: 'system',
          content:
            'Map a saved applicant answer to one visible dropdown option. Preserve the answer meaning exactly. Do not infer or change personal, demographic, disability, veteran, authorization, or sponsorship facts. Return JSON only: {"option":"exact visible label"} or {"option":null} when none is semantically equivalent.'
        },
        {
          role: 'user',
          content: `Question: ${question}\nSaved answer: ${requested}\nVisible options:\n${labels
            .slice(0, 80)
            .map((label, index) => `${index + 1}. ${label.slice(0, 240)}`)
            .join('\n')}`
        }
      ], { json: true, maxTokens: 180, temperature: 0, onUsage: ctx.hooks.onUsage })
      const result = parseJson<{ option?: string | null }>(raw)
      const reviewed = typeof result.option === 'string' ? result.option.trim() : ''
      const exact = labels.find((label) => normalizeComparable(label) === normalizeComparable(reviewed))
      if (exact) {
        ctx.hooks.onStep('verify', `Agent review chose visible option “${exact}”.`)
        return exact
      }
    } catch (error) {
      ctx.hooks.onStep('verify', `Option review could not resolve the wording: ${error instanceof Error ? error.message : error}`)
    }
    return null
  }
}

/**
 * Find required fields that are still empty. A field counts as required if it
 * has the `required`/`aria-required` attribute OR its label carries a `*`.
 * Used to gate submission so we never submit a half-filled form.
 */
async function findIncompleteRequired(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const isVisible = (el: Element): boolean => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
    }
    const deepQueryAll = (selector: string, start: Document | ShadowRoot | Element = document): Element[] => {
      const found: Element[] = []
      const visit = (root: Document | ShadowRoot | Element) => {
        for (const element of Array.from(root.querySelectorAll(selector))) found.push(element)
        for (const element of Array.from(root.querySelectorAll('*'))) {
          if (element.shadowRoot) visit(element.shadowRoot)
        }
      }
      visit(start)
      return Array.from(new Set(found))
    }
    const labelText = (el: HTMLElement): string => {
      const tree = el.getRootNode() as Document | ShadowRoot
      const id = el.getAttribute('id')
      if (id) {
        const l = tree.querySelector(`label[for="${CSS.escape(id)}"]`)
        if (l?.textContent) return l.textContent.trim()
      }
      const p = el.closest('label, .application-question, .field, li, div')
      return (p?.querySelector('label')?.textContent || p?.textContent || el.getAttribute('name') || '').trim().slice(0, 60)
    }
    const missing: string[] = []
    const fields = deepQueryAll('input, textarea, select, [role="combobox"]') as HTMLInputElement[]
    for (const el of fields) {
      const type = (el.type || '').toLowerCase()
      if (['hidden', 'submit', 'button', 'search'].includes(type)) continue
      if (el.getAttribute('aria-hidden') === 'true') continue
      const label = labelText(el)
      const req =
        el.hasAttribute('required') ||
        el.getAttribute('aria-required') === 'true' ||
        /\*/.test(label)
      if (!req) continue
      if (type === 'file') {
        if (!el.files || el.files.length === 0) missing.push(label || 'Resume/file')
        continue
      }
      if (type === 'checkbox' || type === 'radio') {
        // for a radio/checkbox group, require at least one checked with same name
        const name = el.name
        if (name) {
          const tree = el.getRootNode() as Document | ShadowRoot
          const anyChecked = tree.querySelector(`input[name="${CSS.escape(name)}"]:checked`)
          if (!anyChecked && isVisible(el)) missing.push(label || name)
        }
        continue
      }
      if (el.getAttribute('role') === 'combobox') {
        const control =
          el.closest('.select__control, [class*="-control"], [class*="control"]') ||
          el.parentElement?.parentElement ||
          el.parentElement
        const scope = control?.parentElement || control
        const selected = scope?.querySelector(
          '.select__single-value, [class*="singleValue" i], [class*="single-value" i], [data-value]'
        )
        const hidden = scope?.querySelector('input[type="hidden"]') as HTMLInputElement | null
        const rendered = (el.textContent || '').replace(/\s+/g, ' ').trim()
        const renderedSelection =
          el.tagName !== 'INPUT' &&
          !/^\s*(select|choose|pick)(\.{3}| an? option)?\s*$/i.test(rendered)
            ? rendered
            : ''
        if (
          isVisible(el) &&
          !String(
            el.getAttribute('aria-valuetext') ||
            selected?.textContent ||
            hidden?.value ||
            renderedSelection ||
            el.value ||
            ''
          ).trim()
        ) {
          missing.push(label || el.name || 'choice')
        }
        continue
      }
      if (isVisible(el) && !el.value.trim()) missing.push(label || el.name || 'field')
    }

    // Ashby renders required Yes/No questions as two aria-pressed buttons plus
    // a visually hidden checkbox. The generic input loop above cannot see that
    // group, so detect it explicitly before allowing submission.
    const customChoiceGroups = deepQueryAll('[data-field-path], .ashby-application-form-field-entry')
    for (const group of customChoiceGroups) {
      const heading = group.querySelector('.ashby-application-form-question-title, legend, [data-question]')
      const question = (heading?.textContent || '').replace(/\s+/g, ' ').trim()
      const required =
        !!heading &&
        (/required/i.test(String(heading.className)) || heading.hasAttribute('aria-required') || /\*$/.test(question))
      if (!required) continue
      const pressed = group.querySelector(
        'button[data-option][aria-pressed="true"], [role="radio"][aria-checked="true"], input[type="radio"]:checked'
      )
      const hasChoices = group.querySelector(
        'button[data-option], [role="radio"], input[type="radio"]'
      )
      if (hasChoices && !pressed) missing.push(question || 'required choice')
    }
    return Array.from(new Set(missing)).slice(0, 12)
  })
}

function knownChoicePlan(profile: Profile, obs: Observation): PlannedAction | null {
  const groups = new Map<string, typeof obs.elements>()
  for (const element of obs.elements) {
    if (!element.label || !element.option) continue
    const members = groups.get(element.label) ?? []
    members.push(element)
    groups.set(element.label, members)
  }

  for (const [question, options] of groups) {
    const desired = deterministicYesNo(question, profile)
    if (desired == null) continue
    const desiredLabel = desired ? 'yes' : 'no'
    const matching = options.find((option) => normalizeOption(option.option) === desiredLabel)
    if (!matching || matching.checked) continue
    return {
      action: 'click',
      target: matching.ref,
      reason: `Deterministic profile mapping: ${question} → ${desiredLabel.toUpperCase()}.`
    }
  }
  return null
}

/**
 * Advance multi-step application dialogs once their current required fields
 * are complete. This keeps optional blanks (for example a missing middle name)
 * from trapping the model on an already-filled field.
 */
async function knownProgressPlan(page: Page, obs: Observation): Promise<PlannedAction | null> {
  const dialog = page.locator(ACTIVE_MODAL_SELECTOR).filter({
    has: page.locator('input:visible, textarea:visible, select:visible, [role="combobox"]:visible')
  }).first()
  const form = page.locator('form:visible').filter({
    has: page.locator('input:visible, textarea:visible, select:visible, [role="combobox"]:visible')
  }).first()
  const scope = (await dialog.count()) > 0 ? dialog : form
  if ((await scope.count()) === 0) return null
  if ((await findIncompleteRequired(page)).length > 0) return null

  const candidates = scope
    .locator('button:visible, input[type="button"]:visible, input[type="submit"]:visible, [role="button"]:visible')
  const count = await candidates.count()
  for (const wanted of ['next', 'continue', 'review']) {
    for (let index = 0; index < count; index++) {
      const candidate = candidates.nth(index)
      if (await candidate.isDisabled().catch(() => true)) continue
      const label = (
        await candidate.innerText().catch(() => '') ||
        await candidate.getAttribute('value').catch(() => '') ||
        await candidate.getAttribute('aria-label').catch(() => '') ||
        ''
      ).replace(/\s+/g, ' ').trim().toLowerCase()
      if (label !== wanted) continue
      const refAttribute = await candidate.getAttribute('data-auta-ref')
      if (refAttribute == null) continue
      const ref = Number(refAttribute)
      if (!Number.isInteger(ref)) continue
      const observed = obs.elements.find((element) => element.ref === ref)
      if (!observed) continue
      return {
        action: 'click',
        target: ref,
        reason: `Current step is complete; advance with “${wanted[0].toUpperCase()}${wanted.slice(1)}”.`
      }
    }
  }
  return null
}

/**
 * A LinkedIn search URL with currentJobId already identifies the exact job the
 * user pasted. Open that job's Easy Apply dialog directly; never let the model
 * reinterpret the target and replace it with a new job search.
 */
async function knownStartPlan(page: Page, job: Job, obs: Observation): Promise<PlannedAction | null> {
  const current = new URL(obs.url)
  if (!/(^|\.)linkedin\.com$/i.test(current.hostname)) return null
  if (!current.searchParams.get('currentJobId') && !/\/jobs\/view\//i.test(current.pathname)) return null
  if (normalizedHostname(obs.url) !== normalizedHostname(job.url)) return null
  if ((await page.locator(ACTIVE_MODAL_SELECTOR).count()) > 0) return null

  const buttons = page.locator('button:visible')
  let easyApply: Observation['elements'][number] | undefined
  for (let index = 0; index < await buttons.count(); index++) {
    const button = buttons.nth(index)
    const text = (await button.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
    const aria = (await button.getAttribute('aria-label').catch(() => '') || '').replace(/\s+/g, ' ').trim()
    const pressed = await button.getAttribute('aria-pressed').catch(() => null)
    const classes = await button.getAttribute('class').catch(() => '') || ''
    const description = `${text} ${aria}`.trim()
    if (pressed != null || /\bfilter\b/i.test(description)) continue
    if (!/^easy apply(?:\b|$)/i.test(description) && !/jobs-apply-button/.test(classes)) continue
    const rawRef = await button.getAttribute('data-auta-ref').catch(() => null)
    if (rawRef == null) continue
    const ref = Number(rawRef)
    easyApply = obs.elements.find((element) => element.ref === ref)
    if (easyApply) break
  }
  if (!easyApply) return null
  return {
    action: 'click',
    target: easyApply.ref,
    reason: 'Open Easy Apply for the exact LinkedIn job selected by the pasted URL.'
  }
}

function knownFieldPlan(
  profile: Profile,
  job: Job,
  obs: Observation,
  completedFields: Set<string> = new Set(),
  agentOnlyFields: Set<string> = new Set()
): PlannedAction | null {
  const per = profile.personal
  const fullParts = per.fullName.trim().split(/\s+/).filter(Boolean)
  const firstName = per.firstName || fullParts[0] || ''
  const middleName = per.middleName || (fullParts.length > 2 ? fullParts.slice(1, -1).join(' ') : '')
  const lastName = per.lastName || (fullParts.length > 1 ? fullParts.at(-1) || '' : '')
  const structuredFullName = [firstName, middleName, lastName, per.nameSuffix].filter(Boolean).join(' ') || per.fullName
  const location = [per.city, per.state, per.country].filter(Boolean).join(', ')

  for (const element of obs.elements) {
    const identity = fieldIdentity(element)
    if (identity && (completedFields.has(identity) || agentOnlyFields.has(identity))) continue
    const label = `${element.label ?? ''} ${element.placeholder ?? ''} ${element.name ?? ''}`.toLowerCase()
    const isCombo = element.tag === 'select' || element.role === 'combobox' || element.options?.length
    const customCombo = isCombo && element.tag !== 'select'

    if (element.type === 'file' && /resume|cv/.test(`${element.id ?? ''} ${label}`)) {
      if (element.value?.trim()) continue
      return { action: 'upload', target: element.ref, file: 'resume', reason: 'Attach the saved resume once.' }
    }

    const boolean = deterministicYesNo(label, profile)
    if (isCombo && boolean != null && !customCombo) {
      const value = boolean ? 'Yes' : 'No'
      if (valuesEquivalent(element.value, value)) continue
      return {
        action: 'select',
        target: element.ref,
        value,
        reason: `Profile-backed answer for “${cleanQuestion(element.label)}”.`
      }
    }

    let value = ''
    if (/\bfirst name\b|given.?name/.test(label)) value = firstName
    else if (/\bmiddle name\b|middle initial/.test(label)) value = middleName
    else if (/\blast name\b|family.?name|surname/.test(label)) value = lastName
    else if (/\b(name )?suffix\b/.test(label)) value = per.nameSuffix
    else if (/\bfull name\b|^name\*?$/.test(label.trim())) value = structuredFullName
    else if (/\bemail\b/.test(label)) {
      value = per.email
      // LinkedIn owns this dropdown and may expose only the email attached to
      // the signed-in account. Re-selecting an unavailable application email
      // forever prevented the enabled Next button from ever being reached.
      // Accept a different, valid, already-selected account email only for
      // LinkedIn finite-choice controls; ordinary email inputs are unchanged.
      if (
        isLinkedInUrl(obs.url) &&
        isCombo &&
        isValidEmail(element.value) &&
        !valuesEquivalent(element.value, value) &&
        !choiceOffersValue(element.options, value)
      ) continue
    }
    else if (/phone country code|dial(?:ing)? code/.test(label)) value = per.phoneCountryCode
    else if (/\bphone\b|mobile/.test(label)) value = per.phone
    else if (/location|current city|city.*location/.test(label)) value = location || per.city
    else if (/\bcountry\b|country of residence/.test(label)) value = per.countryOfResidence || per.country
    else if (
      /linkedin/.test(label) &&
      !/\bshare\b/.test(label) &&
      (/\b(url|profile|link)\b/.test(label) || element.type === 'url')
    ) value = per.linkedinUrl
    else if (/github/.test(label) && element.tag !== 'textarea' && label.length < 100) value = per.githubUrl
    else if (/portfolio/.test(label) && element.tag !== 'textarea') value = per.portfolioUrl
    else if (/personal website|website url/.test(label)) value = per.websiteUrl
    else if (/^gender\b/.test(label.trim())) value = profile.eeo.gender
    else if (/hispanic|latino/.test(label)) value = profile.eeo.hispanicLatino
    else if (/veteran/.test(label)) value = profile.eeo.veteranStatus
    else if (/disability/.test(label)) value = profile.eeo.disabilityStatus
    else if (/race|ethnicity/.test(label)) value = profile.eeo.raceEthnicity
    else if (/pronoun/.test(label)) value = profile.eeo.pronouns
    else if (/salary expectation|expected (salary|pay|compensation)/.test(label)) {
      value = profile.compensation.expectedBase || profile.compensation.salaryExpectation
    }
    else if (/current (salary|pay|compensation)/.test(label)) {
      value = profile.compensation.currentTotal || profile.compensation.currentBase
    }

    if (!value.trim()) continue
    // Custom dropdowns are deliberately delegated to the screenshot+DOM
    // planner. Their rendered value, popup mechanics, and option vocabulary
    // vary across portals; hard-coding them is what caused cross-site loops.
    if (customCombo) continue
    // Greenhouse labels the phone dial-code picker simply “Country”. Its
    // selected chip intentionally renders “+91” rather than “India”, so a
    // country-name comparison made the mapper select the same valid option on
    // every pass. Treat the matching profile dial code as committed while
    // retaining normal country-name matching for real country fields.
    if (
      /\bcountry\b|country of residence/.test(label) &&
      /^\s*\+?\d[\d\s()-]*\s*$/.test(element.value ?? '') &&
      dialCodesEquivalent(element.value, per.phoneCountryCode)
    ) continue
    if (
      valuesEquivalent(element.value, value) ||
      (/phone country code|dial(?:ing)? code/.test(label) && dialCodesEquivalent(element.value, value))
    ) continue
    return {
      action: isCombo ? 'select' : 'type',
      target: element.ref,
      value: isCombo ? value : undefined,
      text: isCombo ? undefined : value,
      reason: `Deterministic candidate profile mapping for “${cleanQuestion(element.label)}”.`
    }
  }

  // Keep the parameter explicit: future company-specific mappings use the job
  // context without asking the model to rediscover it.
  void job
  return null
}

function fieldIdentity(element: Observation['elements'][number] | undefined): string {
  if (!element) return ''
  const semantic = cleanQuestion(element.label || element.name || element.id || element.placeholder || '')
    .toLowerCase()
  return semantic ? `${element.tag}:${semantic}` : ''
}

function isLinkedInUrl(value: string): boolean {
  try {
    return /(^|\.)linkedin\.com$/i.test(new URL(value).hostname)
  } catch {
    return false
  }
}

function isValidEmail(value: string | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value?.trim() ?? '')
}

function choiceOffersValue(options: string[] | undefined, desired: string): boolean {
  return Boolean(options?.some((option) => valuesEquivalent(option, desired)))
}

/**
 * Compare what the form currently contains with the deterministic Profile
 * value. LinkedIn frequently prefills a signed-in account identity that is not
 * the candidate identity, so a merely non-empty field is not enough. At the
 * same time, phone punctuation and URL schemes should not cause rewrites.
 */
function valuesEquivalent(current: string | undefined, desired: string | undefined): boolean {
  if (!current?.trim() || !desired?.trim()) return false
  const left = normalizeComparable(current)
  const right = normalizeComparable(desired)
  if (left === right) return true

  const leftDigits = current.replace(/\D/g, '')
  const rightDigits = desired.replace(/\D/g, '')
  if (leftDigits.length >= 7 && rightDigits.length >= 7) {
    return leftDigits === rightDigits || leftDigits.endsWith(rightDigits) || rightDigits.endsWith(leftDigits)
  }

  const stripUrl = (value: string): string => value
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
  return stripUrl(left) === stripUrl(right)
}

function dialCodesEquivalent(current: string | undefined, desired: string | undefined): boolean {
  if (!current?.trim() || !desired?.trim()) return false
  const left = current.replace(/\D/g, '')
  const right = desired.replace(/\D/g, '')
  return Boolean(left && right && left === right)
}

function choiceConflict(profile: Profile, target: Observation['elements'][number] | undefined): string | null {
  if (!target?.label || !target.option) return null
  const desired = deterministicYesNo(target.label, profile)
  if (desired == null) return null
  const selected = normalizeOption(target.option)
  const expected = desired ? 'yes' : 'no'
  if (selected === expected) return null
  return `Corrected contradictory plan: using “${expected.toUpperCase()}” for “${target.label}” instead of “${target.option}”.`
}

function deterministicYesNo(question: string, profile: Profile): boolean | null {
  const q = question.toLowerCase()
  if (/sponsor|sponsorship|visa support/.test(q)) {
    const sponsorshipCountry = profile.workAuthorization.sponsorshipCountries.find((country) =>
      country.trim() && q.includes(country.trim().toLowerCase())
    )
    if (sponsorshipCountry) return true
    if (/united states|\bu\.?s\.?\b|america/.test(q)) {
      return parseYesNo(profile.workAuthorization.usSponsorship || profile.workAuthorization.requireSponsorship)
    }
    return parseYesNo(profile.workAuthorization.requireSponsorship)
  }
  if (/legally authorized|authori[sz]ed to work|eligible to work/.test(q)) {
    const authorizedCountry = profile.workAuthorization.authorizedCountries.find((country) =>
      country.trim() && q.includes(country.trim().toLowerCase())
    )
    if (authorizedCountry) return true
    if (/united states|\bu\.?s\.?\b|america/.test(q)) {
      return parseYesNo(profile.workAuthorization.usAuthorized || profile.workAuthorization.legallyAuthorized)
    }
    if (/united kingdom|\bu\.?k\.?\b/.test(q)) return parseYesNo(profile.workAuthorization.ukAuthorized)
    if (/canada/.test(q)) return parseYesNo(profile.workAuthorization.canadaAuthorized)
    if (/europe|\beu\b|eea/.test(q)) return parseYesNo(profile.workAuthorization.euAuthorized)
    return parseYesNo(profile.workAuthorization.legallyAuthorized)
  }
  if (/restrictive covenant|non-?competition|non-?solicitation/.test(q)) return parseYesNo(profile.screening.restrictiveCovenant)
  if (/current(ly)? employed.*brand partner/.test(q)) return parseYesNo(profile.screening.currentBrandPartner)
  if (/deployed.*(ai|llm|rag|agent).*real users|personally deployed/.test(q)) return parseYesNo(profile.screening.deployedAiToProduction)
  if (/previously employed|ever been employed|worked (at|for)/.test(q)) {
    const employers = [...profile.screening.previouslyEmployedByCompanies, ...profile.roles.map((role) => role.company)]
      .map((company) => company.trim().toLowerCase())
      .filter(Boolean)
    if (employers.length) return employers.some((company) => q.includes(company))
  }
  if (/conflict of interest/.test(q)) return parseYesNo(profile.screening.conflictOfInterest)
  if (/background check/.test(q)) return parseYesNo(profile.screening.backgroundCheckConsent)
  if (/drug test/.test(q)) return parseYesNo(profile.screening.drugTestConsent)
  if (/relocat|move to/.test(q)) {
    return parseYesNo(profile.applicationPreferences?.willingToRelocate ?? '') ?? true
  }
  if (/\b(contract|contractor)\b/.test(q) && /united states|\bu\.?s\.?\b|america/.test(q)) {
    return parseYesNo(profile.applicationPreferences.openToUSContract)
  }
  if (/\b(contract|contractor)\b/.test(q) && /international|outside|global/.test(q)) {
    return parseYesNo(profile.applicationPreferences.openToInternationalContract)
  }
  if (/remote/.test(q) && /united states|\bu\.?s\.?\b|america/.test(q)) {
    return parseYesNo(profile.applicationPreferences.openToUSRemote || profile.applicationPreferences.openToRemote)
  }
  if (/remote/.test(q)) return parseYesNo(profile.applicationPreferences.openToRemote)
  if (/hybrid/.test(q)) return parseYesNo(profile.applicationPreferences.openToHybrid)
  if (/open to.*on-?site|onsite role/.test(q)) return parseYesNo(profile.applicationPreferences.openToOnsite)
  if (/travel/.test(q)) return parseYesNo(profile.applicationPreferences.willingToTravel)
  if (/fully onsite|on-?site schedule|days? a week.*office|work.*office/.test(q)) {
    return parseYesNo(profile.applicationPreferences?.comfortableFullyOnsite ?? '') ?? true
  }
  return null
}

function cleanQuestion(value: string | undefined): string {
  return (value || 'this field').replace(/\s+/g, ' ').replace(/\*+$/, '').trim()
}

function parseYesNo(value: string): boolean | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (/^(yes|y|true|1|required|require|needed|need)$/.test(normalized)) return true
  if (/^(no|n|false|0|not required|do not require|none)$/.test(normalized)) return false
  if (/\b(yes|require|need|sponsor)\b/.test(normalized) && !/\b(no|not|don't|do not)\b/.test(normalized)) return true
  if (/\b(no|not required|do not require|don't require)\b/.test(normalized)) return false
  return null
}

function normalizeOption(value: string | undefined): string {
  const normalized = (value ?? '').trim().toLowerCase()
  if (/^(yes|y|true|1)$/.test(normalized)) return 'yes'
  if (/^(no|n|false|0)$/.test(normalized)) return 'no'
  return normalized
}

const PLANNER_ACTIONS = new Set<PlannedAction['action']>([
  'click',
  'type',
  'select',
  'upload',
  'scroll',
  'checkpoint',
  'answer_needed',
  'navigate',
  'done'
])
const PLANNER_CHECKPOINTS = new Set<CheckpointType>([
  'captcha',
  'account_creation',
  'password_or_sso',
  'email_otp',
  'final_submit'
])

/** Reject syntactically valid but unusable model output before it reaches Playwright. */
function validatePlannedAction(value: unknown): PlannedAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Planner response is not a JSON object')
  }
  const candidate = value as Record<string, unknown>
  if (typeof candidate.action !== 'string' || !PLANNER_ACTIONS.has(candidate.action as PlannedAction['action'])) {
    throw new Error('Planner response has an unknown action')
  }

  const action = candidate.action as PlannedAction['action']
  const targeted = new Set<PlannedAction['action']>(['click', 'type', 'select', 'upload', 'answer_needed'])
  if (targeted.has(action) && refNum(candidate.target as number | string | undefined) == null) {
    throw new Error(`Planner action “${action}” is missing a valid target`)
  }
  if (action === 'type' && typeof candidate.text !== 'string') {
    throw new Error('Planner type action is missing text')
  }
  if (action === 'select' && typeof candidate.value !== 'string') {
    throw new Error('Planner select action is missing a value')
  }
  if (action === 'scroll' && candidate.direction !== 'up' && candidate.direction !== 'down') {
    throw new Error('Planner scroll action needs direction “up” or “down”')
  }
  if (action === 'navigate' && typeof candidate.url !== 'string') {
    throw new Error('Planner navigate action is missing a URL')
  }
  if (action === 'done' && typeof candidate.success !== 'boolean') {
    throw new Error('Planner done action is missing success state')
  }
  if (
    action === 'checkpoint' &&
    candidate.checkpointType != null &&
    (typeof candidate.checkpointType !== 'string' || !PLANNER_CHECKPOINTS.has(candidate.checkpointType as CheckpointType))
  ) {
    throw new Error('Planner requested an unsupported checkpoint')
  }
  return candidate as unknown as PlannedAction
}

/**
 * Surface safe, blank professional narrative fields explicitly to the planner.
 * This deliberately excludes voluntary demographic and other sensitive fields:
 * an optional field is not permission to fabricate a personal fact.
 */
function blankOptionalProfessionalFields(obs: Observation): string[] {
  const professional =
    /additional (information|details)|anything else|cover (letter|note)|motivation|why (are you|do you|this|join)|interest(ed)? in|qualifications?|relevant experience|tell us (about|why)|message to|hiring (team|manager)|comments?|professional summary|about you/i
  const sensitive =
    /gender|race|ethnic|veteran|disabil|date of birth|birth date|\bage\b|social security|\bssn\b|government id|criminal|salary history|referral|how did you hear|pronouns?/i

  return obs.elements
    .filter((element) => {
      if (element.value?.trim()) return false
      const type = (element.type ?? '').toLowerCase()
      const isNarrative = element.tag === 'textarea' || (element.tag === 'input' && ['', 'text'].includes(type))
      if (!isNarrative) return false
      const descriptor = [element.label, element.placeholder, element.name, element.text].filter(Boolean).join(' ')
      return professional.test(descriptor) && !sensitive.test(descriptor)
    })
    .map((element) => {
      const label = element.label || element.placeholder || element.name || 'professional response'
      return `#${element.ref} — ${label}`
    })
}

/** Heuristic: did the application actually go through? */
async function verifySubmitted(page: Page): Promise<boolean> {
  try {
    const url = new URL(page.url())
    const route = `${url.pathname}${url.search}${url.hash}`.toLowerCase()
    // Match explicit confirmation routes, not loose substrings in job titles or
    // tracking parameters (for example SuccessFactors job-description URLs).
    if (/(^|[\/_?&=#-])(thank-?you|thanks|application-(submitted|success|complete)|confirmation|submitted|completed|success)([\/_?&=#.-]|$)/.test(route)) {
      return true
    }
    return await page.evaluate(() => {
      const visible = (element: Element): boolean => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
      }
      const successText =
        /your application (was |has been )?(successfully )?(submitted|received)|application (successfully )?(submitted|received)|thank you for (applying|your application)|thanks for applying|we('| ha)ve received your application/i
      // Confirmation copy must be in a visible status/banner/heading-sized
      // region. Never scan the entire job description: it may discuss a
      // candidate whose work was "successfully applied" and is not a receipt.
      const candidates = Array.from(
        document.querySelectorAll(
          '[role="alert"], [role="status"], [class*="success" i], [class*="confirmation" i], [data-testid*="success" i], main h1, main h2, main h3, body > h1, body > h2, h1, [role="heading"]'
        )
      )
      return candidates.some((element) => {
        if (!visible(element)) return false
        const text = (element.textContent || '').replace(/\s+/g, ' ').trim()
        return text.length <= 800 && successText.test(text)
      })
    })
  } catch {
    return false
  }
}
/** Coerce a model-supplied ref ("#12", "12", 12) to a plain integer. */
function refNum(t: number | string | undefined | null): number | null {
  if (t == null) return null
  if (typeof t === 'number') return Number.isFinite(t) ? t : null
  const m = String(t).match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}
function trunc(s: string): string {
  return s.length > 60 ? s.slice(0, 60) + '…' : s
}
function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 30)
}

function escapeAttribute(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
