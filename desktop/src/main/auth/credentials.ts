import { randomBytes } from 'crypto'
import type { CredentialLoginMethod, SiteCredential, SiteCredentialInput } from '@shared/types'
import {
  deleteSiteCredentialRecord,
  findSiteCredential,
  listSiteCredentials as listRecords,
  touchSiteCredential,
  upsertSiteCredentialRecord
} from '../store/db'
import { deleteSecret, getSecret, hasSecret, secretName, setSecret } from '../secrets/keychain'

export interface BrokerCredential extends SiteCredential {
  /** Main-process only. Never return this object over IPC or include it in model context. */
  password: string | null
}

export function normalizeCredentialSite(input: string): { scope: string; hostname: string } {
  const raw = input.trim()
  if (!raw) throw new Error('Enter a site URL or hostname.')
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    throw new Error('Enter a valid site URL or hostname.')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Credential sites must use HTTP or HTTPS.')
  let hostname = url.hostname.toLowerCase().replace(/^www\./, '')
  if (hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com')) hostname = 'linkedin.com'
  if (!hostname) throw new Error('The site URL has no hostname.')
  const port = url.port ? `:${url.port}` : ''
  const origin = `${url.protocol}//${hostname}${port}`
  // A few ATS products host many employers on one shared origin. Preserve a
  // stable tenant identifier when it is present so credentials cannot cross
  // from one employer tenant to another.
  const tenantEntry = Array.from(url.searchParams.entries())
    .find(([key]) => ['company', 'companyid', 'tenant', 'organization', 'org'].includes(key.toLowerCase()))
  const tenantKey = tenantEntry?.[0].toLowerCase()
  const tenant = tenantEntry?.[1].trim().toLowerCase() ?? ''
  return { scope: tenant ? `${origin}?${tenantKey}=${encodeURIComponent(tenant)}` : origin, hostname }
}

export function listSiteCredentials(): SiteCredential[] {
  return listRecords().map((record) => ({
    ...record,
    hasPassword: record.method === 'password' && hasSecret(secretName.siteCredentialPassword(record.id))
  }))
}

export function saveSiteCredential(input: SiteCredentialInput): SiteCredential {
  const { scope, hostname } = normalizeCredentialSite(input.siteUrl)
  const email = input.email.trim().toLowerCase()
  if (!email) throw new Error('Enter the account email.')
  if (input.method === 'password' && !input.password?.trim()) {
    throw new Error('Enter a password to save this credential.')
  }
  const record = upsertSiteCredentialRecord({ scope, hostname, email, method: input.method })
  if (input.method === 'password') {
    setSecret(secretName.siteCredentialPassword(record.id), input.password!)
  } else {
    deleteSecret(secretName.siteCredentialPassword(record.id))
  }
  return { ...record, hasPassword: input.method === 'password' }
}

export function rememberGeneratedPassword(siteUrl: string, email: string, password: string): SiteCredential {
  return saveSiteCredential({ siteUrl, email, password, method: 'password' })
}

export function rememberGoogleLogin(siteUrl: string, email: string): SiteCredential {
  return saveSiteCredential({ siteUrl, email, method: 'google' })
}

function credentialRecordForSite(siteUrl: string, email: string): SiteCredential | null {
  try {
    const { scope } = normalizeCredentialSite(siteUrl)
    const normalizedEmail = email.trim().toLowerCase()
    const origin = new URL(scope).origin.replace(/^https?:\/\/www\./i, (match) => match.replace(/www\./i, ''))
    return findSiteCredential(scope, normalizedEmail) ??
      (scope !== origin ? findSiteCredential(origin, normalizedEmail) : null)
  } catch {
    // Browser-internal and transient navigation URLs have no credential scope.
    return null
  }
}

/** Safe account identity lookup for deterministic form prefilling. */
export function credentialMetadataForSite(siteUrl: string, email: string): SiteCredential | null {
  return credentialRecordForSite(siteUrl, email)
}

export function credentialForSite(siteUrl: string, email: string): BrokerCredential | null {
  const record = credentialRecordForSite(siteUrl, email)
  if (!record) return null
  const password = record.method === 'password'
    ? getSecret(secretName.siteCredentialPassword(record.id))
    : null
  return {
    ...record,
    hasPassword: password !== null,
    password
  }
}

export function markCredentialUsed(id: string): void {
  touchSiteCredential(id)
}

export function deleteSiteCredential(id: string): void {
  deleteSecret(secretName.siteCredentialPassword(id))
  deleteSiteCredentialRecord(id)
}

/** 25 characters with mixed classes, avoiding quotes and whitespace. */
export function generateBrokerPassword(): string {
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const symbols = '!@#$%*-_+'
  const all = lower + upper + digits + symbols
  const pick = (alphabet: string): string => alphabet[randomBytes(1)[0] % alphabet.length]
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)]
  while (chars.length < 25) chars.push(pick(all))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export function loginMethodLabel(method: CredentialLoginMethod): string {
  return method === 'google' ? 'Google session' : 'Email and password'
}
