import { rmSync } from 'fs'
import { type BrowserContext } from 'playwright'
import type { BrowserIdentityStatus } from '@shared/types'
import { paths } from '../store/paths'
import { launchAgentBrowser } from '../engine/launch'
import { getBrowserIdentityMarker, setBrowserIdentityMarker } from '../store/db'

/**
 * Manages the reusable automation-browser profile.
 *
 * SAGE never enters a Google password or grants OAuth consent. The user opens
 * this visible session once and signs in directly with Google. Later job runs
 * reuse the same Playwright profile so an existing, user-created session can be
 * selected at a third-party "Continue with Google" screen.
 */
class BrowserIdentityService {
  private context: BrowserContext | null = null

  status(): BrowserIdentityStatus {
    const marker = getBrowserIdentityMarker()
    return {
      ready: marker.ready,
      lastCheckedAt: marker.lastCheckedAt,
      sessionOpen: this.context !== null
    }
  }

  async start(): Promise<BrowserIdentityStatus> {
    if (this.context) return this.status()
    this.context = await launchAgentBrowser(paths.browserProfile(), {
      headless: false,
      viewport: { width: 1180, height: 820 },
      args: ['--disable-blink-features=AutomationControlled']
    })
    const page = this.context.pages()[0] ?? (await this.context.newPage())
    await page
      .goto('https://accounts.google.com/ServiceLogin?continue=https://myaccount.google.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      })
      .catch(() => {})
    await page.bringToFront()
    return this.status()
  }

  async complete(): Promise<BrowserIdentityStatus> {
    if (!this.context) return this.status()
    const cookies = await this.context.cookies().catch(() => [])
    const ready = cookies.some(
      (cookie) =>
        /(^|\.)google\.com$/i.test(cookie.domain) &&
        /^(SID|HSID|SSID|SAPISID|__Secure-1PSID|__Secure-3PSID)$/i.test(cookie.name)
    )
    const lastCheckedAt = new Date().toISOString()
    setBrowserIdentityMarker({ ready, lastCheckedAt })
    if (ready) {
      await this.context.close().catch(() => {})
      this.context = null
    }
    return this.status()
  }

  async cancel(): Promise<BrowserIdentityStatus> {
    await this.context?.close().catch(() => {})
    this.context = null
    return this.status()
  }

  async disconnect(): Promise<BrowserIdentityStatus> {
    await this.cancel()
    setBrowserIdentityMarker({ ready: false, lastCheckedAt: new Date().toISOString() })
    const profilePath = paths.browserProfile()
    rmSync(profilePath, { recursive: true, force: true })
    return this.status()
  }
}

export const browserIdentity = new BrowserIdentityService()
