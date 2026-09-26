import type { Page } from 'playwright'
import type { AppSettings, CheckpointType, Profile } from '@shared/types'
import {
  credentialForSite,
  generateBrokerPassword,
  markCredentialUsed,
  normalizeCredentialSite,
  rememberGeneratedPassword,
  rememberGoogleLogin
} from './credentials'

export interface AuthenticationState {
  passwordAttempts: Set<string>
  googleAttempts: Set<string>
  signupAttempts: Set<string>
  createAccountNavigations: Set<string>
  signInNavigations: Set<string>
  googleAccountSelections: number
  pendingGoogleEmail?: string
  sawAuthenticationGate: boolean
  restoredApplication: boolean
}

export interface AuthenticationResult {
  status: 'none' | 'handled' | 'checkpoint'
  message?: string
  checkpointType?: CheckpointType
  page?: Page
}

export function createAuthenticationState(): AuthenticationState {
  return {
    passwordAttempts: new Set(),
    googleAttempts: new Set(),
    signupAttempts: new Set(),
    createAccountNavigations: new Set(),
    signInNavigations: new Set(),
    googleAccountSelections: 0,
    sawAuthenticationGate: false,
    restoredApplication: false
  }
}

/**
 * Deterministic authentication broker. Passwords are decrypted only in this
 * main-process function, filled directly through Playwright, and never added
 * to observations, planner prompts, logs, or renderer IPC responses.
 */
export async function handleAuthentication(
  page: Page,
  profile: Profile,
  settings: AppSettings,
  state: AuthenticationState
): Promise<AuthenticationResult> {
  const email = profile.personal.email.trim().toLowerCase()
  if (!email) return { status: 'none' }

  const hostname = safeHostname(page.url())
  if (hostname === 'accounts.google.com') {
    return handleGoogleAccountChooser(page, state.pendingGoogleEmail ?? email, state)
  }

  const passwordFields = page.locator('input[type="password"]:visible')
  const passwordCount = await passwordFields.count().catch(() => 0)
  const googleButton = googleSignInButton(page)
  const googleVisible = await googleButton.isVisible().catch(() => false)
  const authPath = safePathname(page.url())
  const authHeading = page
    .locator('h1:visible, h2:visible, legend:visible, [role="heading"]:visible')
    .filter({ hasText: /^\s*(sign in|log in|login|create (an )?account|register|join now)\b/i })
  const authPage =
    passwordCount > 0 ||
    /(^|\/)(login|log-in|signin|sign-in|signup|sign-up|register|auth)(\/|$)/i.test(authPath) ||
    ((googleVisible || await page.locator('input[type="email"]:visible, input[autocomplete="username"]:visible').count() > 0) &&
      await authHeading.count() > 0)

  if (!authPage) return { status: 'none' }

  // Navigation failures and browser-internal pages must never crash the run
  // merely because their error copy happens to contain “sign in”.
  if (!hostname || !/^https?:\/\//i.test(page.url())) return { status: 'none' }

  const { scope } = normalizeCredentialSite(page.url())
  const credential = credentialForSite(page.url(), email)
  // A site's login identity is independent from the email used on job forms.
  // If the user saved a credential for another account, that saved identity is
  // authoritative for authentication while the profile email remains the
  // authoritative application/contact email.
  const accountEmail = credential?.email ?? email

  // A remembered Google method, or the user's global Google preference, wins
  // before password/account-creation flows when the site visibly offers it.
  if (
    googleVisible &&
    credential?.method !== 'password' &&
    (credential?.method === 'google' || settings.preferGoogleSignIn) &&
    !state.googleAttempts.has(scope)
  ) {
    state.googleAttempts.add(scope)
    state.pendingGoogleEmail = accountEmail
    if (credential) markCredentialUsed(credential.id)
    else rememberGoogleLogin(page.url(), accountEmail)
    const nextPage = await clickWithPopup(page, googleButton)
    return { status: 'handled', page: nextPage, message: `Using the saved Google browser session for ${hostname}.` }
  }

  const isSignup = passwordCount >= 2 || await hasSignupPasswordField(page)
  if (isSignup) {
    if (credential) {
      const signIn = page
        .locator('button:visible, a:visible, [role="button"]:visible')
        .filter({ hasText: /^\s*(sign in|log in|login)\s*$/i })
        .first()
      if (await signIn.isVisible().catch(() => false) && !state.signInNavigations.has(scope)) {
        state.signInNavigations.add(scope)
        await signIn.click({ timeout: 8000 })
        return { status: 'handled', message: `A credential already exists for ${hostname}; returning to its sign-in form.` }
      }
      return {
        status: 'checkpoint',
        checkpointType: 'account_creation',
        message: `${hostname} is showing account creation even though SAGE already has a protected login for this account. Open the sign-in form, then resume.`
      }
    }
    if (!settings.autoCreateAccounts) return { status: 'none' }
    if (state.signupAttempts.has(scope)) return { status: 'none' }
    state.signupAttempts.add(scope)

    const generated = generateBrokerPassword()
    const saved = rememberGeneratedPassword(page.url(), accountEmail, generated)
    await fillIdentityFields(page, profile)
    await fillPasswordFields(passwordFields, generated)

    if (await requiresTermsReview(page)) {
      return {
        status: 'checkpoint',
        checkpointType: 'account_creation',
        message: `SAGE securely generated and saved a password for ${hostname} and filled the account form. Review the site terms in the browser and complete account creation; the AI never receives the password.`
      }
    }

    const submit = signupSubmitButton(page)
    if (!(await submit.isVisible().catch(() => false))) {
      return {
        status: 'checkpoint',
        checkpointType: 'account_creation',
        message: `SAGE securely prepared credentials for ${hostname}, but could not identify a safe account-creation button. Complete the visible step, then resume.`
      }
    }
    await submit.click({ timeout: 8000 })
    markCredentialUsed(saved.id)
    return { status: 'handled', message: `Created the ${hostname} account with a broker-managed password.` }
  }

  if (passwordCount === 1 && credential?.method === 'password' && credential.password) {
    if (state.passwordAttempts.has(scope)) {
      return {
        status: 'checkpoint',
        checkpointType: 'password_or_sso',
        message: `The saved credential for ${hostname} did not complete sign-in. Check or update it in Settings, or sign in manually, then resume.`
      }
    }
    state.passwordAttempts.add(scope)
    await fillEmailField(page, credential.email || email)
    await passwordFields.first().fill(credential.password)
    const submit = signinSubmitButton(page)
    if (!(await submit.isVisible().catch(() => false))) return { status: 'none' }
    await submit.click({ timeout: 8000 })
    markCredentialUsed(credential.id)
    return { status: 'handled', message: `Signed in to ${hostname} with a protected saved credential.` }
  }

  if (googleVisible && settings.preferGoogleSignIn && !state.googleAttempts.has(scope)) {
    state.googleAttempts.add(scope)
    state.pendingGoogleEmail = accountEmail
    if (credential) markCredentialUsed(credential.id)
    else rememberGoogleLogin(page.url(), accountEmail)
    const nextPage = await clickWithPopup(page, googleButton)
    return { status: 'handled', page: nextPage, message: `No site password was saved; trying the existing Google browser session for ${hostname}.` }
  }

  if (passwordCount === 1 && settings.autoCreateAccounts && !state.createAccountNavigations.has(scope)) {
    const create = createAccountLink(page)
    if (await create.isVisible().catch(() => false)) {
      state.createAccountNavigations.add(scope)
      await create.click({ timeout: 8000 })
      return { status: 'handled', message: `No credential exists for ${hostname}; opening its account-creation form.` }
    }
  }

  return { status: 'none' }
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase()
  } catch {
    return ''
  }
}

async function handleGoogleAccountChooser(
  page: Page,
  email: string,
  state: AuthenticationState
): Promise<AuthenticationResult> {
  const bodyText = await page.locator('body').innerText({ timeout: 2000 }).catch(() => '')
  if (/(wants to access|review (the )?permissions|allow access|grant access)/i.test(bodyText.slice(0, 5000))) {
    return { status: 'none' }
  }
  if (await page.locator('input[type="password"]:visible').count()) return { status: 'none' }
  if (state.googleAccountSelections >= 2) return { status: 'none' }
  const account = page.getByText(email, { exact: true }).first()
  if (!(await account.isVisible().catch(() => false))) return { status: 'none' }
  state.googleAccountSelections++
  await account.click({ timeout: 8000 })
  return { status: 'handled', message: `Selected the existing Google session for ${email}.` }
}

function googleSignInButton(page: Page) {
  return page
    .locator('button:visible, a:visible, [role="button"]:visible')
    .filter({ hasText: /^\s*(sign in|log in|continue|sign up|register)(\s+with)?\s+google\s*$/i })
    .first()
}

function signinSubmitButton(page: Page) {
  const buttons = page
    .locator('button[type="submit"]:visible, button:visible')
    .filter({ hasText: /^\s*(sign in|log in|login|continue|next)\s*$/i })
  const inputs = page.locator([
    'input[type="submit"][value*="sign in" i]:visible',
    'input[type="submit"][value*="log in" i]:visible',
    'input[type="submit"][value*="login" i]:visible',
    'input[type="submit"][value*="continue" i]:visible',
    'input[type="submit"][value*="next" i]:visible'
  ].join(', '))
  return buttons.or(inputs).first()
}

function signupSubmitButton(page: Page) {
  const buttons = page
    .locator('button[type="submit"]:visible, button:visible')
    .filter({ hasText: /^\s*(create (my |an )?account|sign up|register|continue)\s*$/i })
  const inputs = page.locator([
    'input[type="submit"][value*="create" i]:visible',
    'input[type="submit"][value*="sign up" i]:visible',
    'input[type="submit"][value*="register" i]:visible',
    'input[type="submit"][value*="continue" i]:visible'
  ].join(', '))
  return buttons.or(inputs).first()
}

function createAccountLink(page: Page) {
  return page
    .locator('button:visible, a:visible, [role="button"]:visible')
    .filter({ hasText: /^\s*(create (an )?account|sign up|register)\s*$/i })
    .first()
}

async function hasSignupPasswordField(page: Page): Promise<boolean> {
  return page.locator(
    'input[type="password"][name*="confirm" i]:visible, input[type="password"][id*="confirm" i]:visible, input[type="password"][placeholder*="confirm" i]:visible'
  ).count().then((count) => count > 0).catch(() => false)
}

async function fillIdentityFields(page: Page, profile: Profile): Promise<void> {
  await fillEmailField(page, profile.personal.email)
  await fillFirstVisible(page, 'input[name*="first" i]:visible, input[id*="first" i]:visible', profile.personal.firstName)
  await fillFirstVisible(page, 'input[name*="last" i]:visible, input[id*="last" i]:visible', profile.personal.lastName)
  await fillFirstVisible(
    page,
    'input[name="name" i]:visible, input[id="name" i]:visible, input[autocomplete="name"]:visible',
    profile.personal.fullName
  )
}

async function fillEmailField(page: Page, email: string): Promise<void> {
  await fillFirstVisible(
    page,
    'input[type="email"]:visible, input[autocomplete="username"]:visible, input[name*="email" i]:visible, input[id*="email" i]:visible',
    email
  )
}

async function fillFirstVisible(page: Page, selector: string, value: string): Promise<void> {
  if (!value.trim()) return
  const field = page.locator(selector).first()
  if (await field.isVisible().catch(() => false)) await field.fill(value)
}

async function fillPasswordFields(fields: ReturnType<Page['locator']>, password: string): Promise<void> {
  const count = await fields.count()
  for (let index = 0; index < count; index++) await fields.nth(index).fill(password)
}

async function requiresTermsReview(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const visible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const terms = /terms( of (use|service))?|privacy policy|user agreement/i
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"], [role="checkbox"]'))
    if (checkboxes.some((box) => {
      if (!visible(box)) return false
      const id = box.getAttribute('id')
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : box.closest('label')
      return terms.test(label?.textContent || box.parentElement?.textContent || '')
    })) return true
    const form = document.querySelector('form')
    return terms.test((form?.textContent || '').slice(-2500))
  }).catch(() => true)
}

async function clickWithPopup(page: Page, locator: ReturnType<Page['locator']>): Promise<Page> {
  const popup = page.context().waitForEvent('page', { timeout: 1500 }).catch(() => null)
  await locator.click({ timeout: 8000 })
  const next = await popup
  if (!next) return page
  await next.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
  return next
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}
