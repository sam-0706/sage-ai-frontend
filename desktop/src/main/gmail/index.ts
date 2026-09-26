import { createServer } from 'http'
import { randomBytes } from 'crypto'
import { shell } from 'electron'
import type { GmailStatus } from '@shared/types'
import { getSecret, setSecret, deleteSecret, secretName } from '../secrets/keychain'

/**
 * Gmail service — READ-ONLY, SURFACE-ONLY.
 *
 * Reads verification emails and surfaces the OTP / magic-link to the user in
 * the app. It never sends mail and never completes authentication on its own.
 * Requires the user's own Google OAuth client (Gmail API enabled) because we
 * cannot ship shared Google credentials.
 */

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'openid', 'email']

interface ClientCreds {
  clientId: string
  clientSecret: string
}
interface StoredToken {
  tokens: unknown
  email: string
}

export function setGmailClient(clientId: string, clientSecret: string): void {
  if (!clientId || !clientSecret) {
    deleteSecret(secretName.gmailClient())
    return
  }
  setSecret(secretName.gmailClient(), JSON.stringify({ clientId, clientSecret } satisfies ClientCreds))
}

function loadClient(): ClientCreds | null {
  const raw = getSecret(secretName.gmailClient())
  try {
    return raw ? (JSON.parse(raw) as ClientCreds) : null
  } catch {
    return null
  }
}
function loadToken(): StoredToken | null {
  const raw = getSecret(secretName.gmailToken())
  try {
    return raw ? (JSON.parse(raw) as StoredToken) : null
  } catch {
    return null
  }
}

export async function gmailStatus(): Promise<GmailStatus> {
  const clientConfigured = loadClient() !== null
  const t = loadToken()
  return t
    ? { connected: true, email: t.email, clientConfigured, scope: 'gmail.readonly' }
    : { connected: false, clientConfigured }
}

export async function gmailDisconnect(): Promise<void> {
  deleteSecret(secretName.gmailToken())
}

export async function gmailConnect(): Promise<GmailStatus> {
  const { google } = await import('googleapis')
  const creds = loadClient()
  if (!creds) {
    throw new Error(
      'Google OAuth client not set. In Settings, add your Google client ID + secret (Gmail API enabled).'
    )
  }

  return new Promise<GmailStatus>((resolve, reject) => {
    let oauth: InstanceType<typeof google.auth.OAuth2>
    const state = randomBytes(24).toString('hex')
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('Gmail authorization timed out.'))
    }, 180000)

    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '', 'http://127.0.0.1')
        const oauthError = url.searchParams.get('error')
        if (oauthError) throw new Error(`Google authorization failed: ${oauthError}`)
        if (url.pathname !== '/oauth2/callback' || url.searchParams.get('state') !== state) {
          res.writeHead(400).end('Invalid OAuth callback')
          return
        }
        const code = url.searchParams.get('code')
        if (!code) {
          res.writeHead(400).end('Missing code')
          return
        }
        const { tokens } = await oauth.getToken(code)
        oauth.setCredentials(tokens)

        const oauth2 = google.oauth2({ version: 'v2', auth: oauth })
        const me = await oauth2.userinfo.get()
        const email = me.data.email ?? 'unknown'

        setSecret(secretName.gmailToken(), JSON.stringify({ tokens, email } satisfies StoredToken))
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(
          '<html><body style="font-family:sans-serif;padding:40px"><h2>SAGE connected to Gmail ✓</h2><p>You can close this tab and return to the app.</p></body></html>'
        )
        clearTimeout(timeout)
        server.close()
        resolve({ connected: true, email, clientConfigured: true, scope: 'gmail.readonly' })
      } catch (e) {
        res.writeHead(500).end('Auth error')
        clearTimeout(timeout)
        server.close()
        reject(e)
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      oauth = new google.auth.OAuth2(
        creds.clientId,
        creds.clientSecret,
        `http://127.0.0.1:${port}/oauth2/callback`
      )
      const authUrl = oauth.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        state,
        include_granted_scopes: true
      })
      shell.openExternal(authUrl)
    })
  })
}

/** Search recent mail for a verification code and/or magic link. Read-only. */
export async function findLatestOtp(): Promise<
  { code?: string; link?: string; from?: string; subject?: string } | null
> {
  const creds = loadClient()
  const stored = loadToken()
  if (!creds || !stored) return null

  const { google } = await import('googleapis')
  const oauth = new google.auth.OAuth2(creds.clientId, creds.clientSecret)
  oauth.setCredentials(stored.tokens as Record<string, unknown>)
  const gmail = google.gmail({ version: 'v1', auth: oauth })

  const list = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 5,
    q: 'newer_than:1h (code OR verify OR verification OR "sign in" OR confirm OR OTP)'
  })
  const first = list.data.messages?.[0]
  if (!first?.id) return null

  const msg = await gmail.users.messages.get({ userId: 'me', id: first.id, format: 'full' })
  const headers = msg.data.payload?.headers ?? []
  const from = headers.find((h) => h.name === 'From')?.value ?? undefined
  const subject = headers.find((h) => h.name === 'Subject')?.value ?? undefined
  const body = decodeBody(msg.data.payload)

  const code = body.match(/\b(\d{4,8})\b/)?.[1]
  const link = body.match(/https?:\/\/[^\s"'<>]+/)?.[0]
  return { code, link, from, subject }
}

function decodeBody(payload: unknown): string {
  const p = payload as {
    body?: { data?: string }
    parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>
  }
  const collect = (node: typeof p): string => {
    let out = ''
    if (node?.body?.data) out += Buffer.from(node.body.data, 'base64').toString('utf-8')
    for (const part of node?.parts ?? []) out += collect(part as typeof p)
    return out
  }
  return collect(p)
}
