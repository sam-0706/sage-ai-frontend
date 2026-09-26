import type { Page } from 'playwright'
import type { CheckpointType } from '@shared/types'

export interface DetectedCheckpoint {
  type: CheckpointType
  message: string
}

/**
 * Deterministic detection of human-verification gates. Runs before every plan
 * step. If it fires for a CAPTCHA or auth wall, the loop pauses without
 * interacting with the protected control and watches for legitimate completion.
 *
 * CAPTCHA detection requires a VISIBLE, rendered challenge — not merely the
 * presence of a captcha script. Many sites (e.g. Lever) load an invisible
 * hCaptcha that stays dormant and passes automatically; pausing for those would
 * be a false alarm.
 */
export async function detectCheckpoint(
  page: Page,
  options: { allowGoogleSession?: boolean } = {}
): Promise<DetectedCheckpoint | null> {
  const found = await page.evaluate(({ allowGoogleSession }) => {
    const q = (s: string) => document.querySelector(s)

    const isVisible = (el: Element | null): boolean => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      const s = window.getComputedStyle(el)
      return r.width > 24 && r.height > 24 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'
    }
    const anyVisible = (sel: string): boolean =>
      Array.from(document.querySelectorAll(sel)).some(isVisible)

    const visibleRecaptchaChallenge = (): boolean =>
      Array.from(document.querySelectorAll('iframe[src*="recaptcha" i], iframe[src*="recaptcha.net" i]')).some(
        (element) => {
          if (!isVisible(element)) return false
          const src = (element.getAttribute('src') || '').toLowerCase()
          const title = (element.getAttribute('title') || '').toLowerCase()
          // Greenhouse and other ATS pages keep a visible 256×60 reCAPTCHA
          // Enterprise badge mounted at all times. It is support chrome, not a
          // challenge. Only pause for a checkbox or challenge frame.
          if (/[?&]size=invisible(?:&|$)/.test(src)) return false
          return /\/bframe|challenge/.test(src) || /challenge/.test(title) || /\/anchor/.test(src)
        }
      ) ||
      Array.from(document.querySelectorAll('.g-recaptcha')).some((element) => {
        if (!isVisible(element)) return false
        return (element.getAttribute('data-size') || '').toLowerCase() !== 'invisible'
      })

    const bodyText = (document.body?.innerText || '').toLowerCase()
    const onGoogleAccounts = window.location.hostname === 'accounts.google.com'
    const siteName = document.title?.trim() || window.location.hostname

    // --- CAPTCHA / bot-check: only when a challenge is actually VISIBLE ---
    if (
      anyVisible('iframe[src*="hcaptcha.com"][title*="challenge" i]') ||
      Array.from(document.querySelectorAll('.h-captcha')).some(
        (element) => isVisible(element) && (element.getAttribute('data-size') || '').toLowerCase() !== 'invisible'
      )
    )
      return { type: 'captcha', message: 'hCaptcha is visible in the browser. Complete it there; SAGE will resume automatically when it clears.' }
    if (visibleRecaptchaChallenge())
      return { type: 'captcha', message: 'reCAPTCHA is visible in the browser. Complete it there; SAGE will resume automatically when it clears.' }
    if (anyVisible('iframe[src*="challenges.cloudflare.com"]'))
      return { type: 'captcha', message: 'Cloudflare Turnstile is visible in the browser. Complete it there; SAGE will resume automatically when it clears.' }
    if (anyVisible('#FunCaptcha, iframe[src*="arkoselabs"]'))
      return { type: 'captcha', message: 'FunCaptcha is visible in the browser. Complete it there; SAGE will resume automatically when it clears.' }

    // --- SSO / password ---
    const googleSso = Array.from(document.querySelectorAll('button, a, div[role="button"]')).some(
      (el) => isVisible(el) && /sign in with google|continue with google|log in with google/i.test(el.textContent || '')
    )
    if (googleSso && !allowGoogleSession)
      return { type: 'password_or_sso', message: 'This site uses Google sign-in. Please complete the sign-in yourself.' }

    // An existing account chooser is safe for the planner to select when the
    // user explicitly enabled reusable browser identity. Password entry and
    // first-time OAuth consent still stop below.
    if (
      onGoogleAccounts &&
      /(wants to access|review (the )?permissions|allow access|grant access)/i.test(bodyText.slice(0, 4000))
    ) {
      return {
        type: 'password_or_sso',
        message: 'Google is asking for new permissions. Review and approve this consent yourself.'
      }
    }

    const pwFields = Array.from(document.querySelectorAll('input[type="password"]')).filter(isVisible)
    const confirmPw = pwFields.some((el) =>
      /confirm|repeat|re-?enter/i.test(
        ((el as HTMLInputElement).name || '') + ((el as HTMLInputElement).getAttribute('placeholder') || '')
      )
    )
    // --- account creation ---
    if (pwFields.length >= 2 || confirmPw)
      return {
        type: 'account_creation',
        message: `${siteName} is asking you to create an account and choose a password. Complete that securely in the open application browser, then return to SAGE.`
      }
    if (pwFields.length === 1)
      return {
        type: 'password_or_sso',
        message: `${siteName} is showing an email-and-password sign-in page. Sign in in the open application browser. If you do not know the password, use “Forgot your password?” there; SAGE can surface the Gmail verification code on the next step.`
      }

    // --- email OTP / verification code ---
    if (/(verification|one-?time|security) code|enter the code (we|that) (sent|emailed)/i.test(bodyText.slice(0, 4000))) {
      const codeField = q('input[autocomplete="one-time-code"], input[name*="otp" i]')
      if (isVisible(codeField)) return { type: 'email_otp', message: 'An email verification code is required.' }
    }

    return null
  }, { allowGoogleSession: options.allowGoogleSession === true })

  return found as DetectedCheckpoint | null
}
