import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

/** All app data lives under the OS userData dir — local-first, per the architecture. */
export function dataDir(): string {
  const dir = app.getPath('userData')
  return dir
}

export function ensureDir(p: string): string {
  mkdirSync(p, { recursive: true })
  return p
}

export const paths = {
  db: () => join(dataDir(), 'auta.db'),
  resumes: () => ensureDir(join(dataDir(), 'resumes')),
  screenshots: () => ensureDir(join(dataDir(), 'screenshots')),
  browserProfile: () => ensureDir(join(dataDir(), 'browser-profile')),
  secrets: () => join(dataDir(), 'secrets.json')
}
