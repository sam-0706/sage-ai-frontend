import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { paths } from '../store/paths'

/**
 * Secret store backed by the OS keychain via Electron safeStorage.
 *
 * Values are encrypted with the OS keychain key and the ciphertext is written
 * to secrets.json (base64). Plaintext secrets never touch disk. If OS
 * encryption is unavailable we refuse to persist rather than store plaintext.
 */

type SecretBag = Record<string, string> // name -> base64 ciphertext

function load(): SecretBag {
  const p = paths.secrets()
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as SecretBag
  } catch {
    return {}
  }
}

function persist(bag: SecretBag): void {
  writeFileSync(paths.secrets(), JSON.stringify(bag), { mode: 0o600 })
}

export function setSecret(name: string, value: string): void {
  if (!value) {
    deleteSecret(name)
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain encryption unavailable — refusing to store secret in plaintext.')
  }
  const bag = load()
  bag[name] = safeStorage.encryptString(value).toString('base64')
  persist(bag)
}

export function getSecret(name: string): string | null {
  const bag = load()
  const enc = bag[name]
  if (!enc) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}

export function hasSecret(name: string): boolean {
  return !!load()[name]
}

export function deleteSecret(name: string): void {
  const bag = load()
  delete bag[name]
  persist(bag)
}

export function wipeSecrets(): void {
  persist({})
}

// naming helpers
export const secretName = {
  providerKey: (id: string) => `provider:${id}:key`,
  skyvernApiKey: () => 'skyvern:api-key',
  siteCredentialPassword: (id: string) => `credential:${id}:password`,
  gmailToken: () => 'gmail:token',
  gmailClient: () => 'gmail:client'
}
