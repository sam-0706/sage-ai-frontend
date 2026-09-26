import { chromium, type BrowserContext } from 'playwright'

type LaunchOptions = Parameters<typeof chromium.launchPersistentContext>[1]

/**
 * Launch the agent's persistent browser. Prefers Playwright's bundled Chromium (dev machines / CI), then falls back
 * to the user's installed Google Chrome or Microsoft Edge so packaged installs work without a separate download.
 */
export async function launchAgentBrowser(profileDir: string, options: LaunchOptions): Promise<BrowserContext> {
  const attempts: Array<LaunchOptions> = [options, { ...options, channel: 'chrome' }, { ...options, channel: 'msedge' }]
  let lastError: unknown
  for (const attempt of attempts) {
    try {
      return await chromium.launchPersistentContext(profileDir, attempt)
    } catch (e) {
      lastError = e
      if (!/Executable doesn't exist|executable|not found|ENOENT|distribution/i.test(String(e))) throw e
    }
  }
  throw new Error(
    'No supported browser found. Install Google Chrome (recommended) or run `npx playwright install chromium`. ' +
      `Details: ${lastError instanceof Error ? lastError.message.split('\n')[0] : String(lastError)}`
  )
}
