import type { LlmUsage, ProviderId, ProviderModel, ProviderTask } from '@shared/types'
import { getProviderConfigs, getSettings } from '../store/db'
import { getSecret, secretName } from '../secrets/keychain'
import { httpChat } from './http'
import { claudeCodeChat } from './claudeCode'
import { apiBase, sessionToken } from '../sage/client'
import { app } from 'electron'

export type MsgContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

export interface Msg {
  role: 'system' | 'user' | 'assistant'
  content: string | MsgContentPart[]
}

export interface ChatOpts {
  temperature?: number
  maxTokens?: number
  /** force JSON output when supported */
  json?: boolean
  /** Receives provider-reported usage for persistent application receipts. */
  onUsage?: (usage: LlmUsage) => void
  /** extra HTTP headers (SAGE dev auth) */
  headers?: Record<string, string>
}

/** The SAGE provider: OpenAI-compatible proxy on the SAGE backend, authenticated with the user's session. */
function sageAuth(): { key: string; headers?: Record<string, string> } {
  const dev = !app.isPackaged ? process.env.SAGE_DEV_EMAIL : undefined
  if (dev) return { key: '', headers: { 'X-Dev-User-Email': dev } }
  const token = sessionToken()
  if (!token) throw new Error('Sign in to SAGE AI to use the included auto-apply models.')
  return { key: token }
}

async function sageChat(task: ProviderTask | null, messages: Msg[], opts: ChatOpts): Promise<string> {
  const { key, headers } = sageAuth()
  const model = task === 'loop' || task === null ? 'sage-vision' : 'sage-text'
  return httpChat('sage', `${apiBase()}/v1/autoapply/llm`, model, key, messages, { ...opts, headers: { ...opts.headers, ...headers } })
}

/** Resolve which provider handles a task, then run a chat completion. */
export async function chatForTask(task: ProviderTask, messages: Msg[], opts: ChatOpts = {}): Promise<string> {
  const settings = getSettings()
  const id = settings.taskProviders[task]
  if (id === 'sage') return sageChat(task, messages, opts)
  return chatWith(id, messages, opts)
}

export async function chatWith(id: ProviderId, messages: Msg[], opts: ChatOpts = {}): Promise<string> {
  const cfg = getProviderConfigs().find((c) => c.id === id)
  if (!cfg) throw new Error(`Unknown provider: ${id}`)
  if (id === 'sage') return sageChat(null, messages, opts)

  if (id === 'claude-code') {
    return claudeCodeChat(messages, cfg.model || 'claude-opus-5', opts)
  }

  const key = getSecret(secretName.providerKey(id)) || ''
  if (!cfg.openaiCompatible) {
    // anthropic native could go here; for now route anthropic key holders through
    // an OpenAI-compatible shim is not correct, so require claude-code or a compat provider.
    throw new Error(`Provider ${id} is not yet wired for direct API; use Claude Code or an OpenAI-compatible provider.`)
  }
  if (!key && id !== 'ollama') throw new Error(`No API key set for ${cfg.label}. Add it in Settings.`)
  return httpChat(id, cfg.baseUrl!, cfg.model!, key, messages, opts)
}

type ModelRecord = {
  id?: unknown
  name?: unknown
  display_name?: unknown
  displayName?: unknown
  type?: unknown
  context_length?: unknown
  contextLength?: unknown
  architecture?: unknown
}

/** Fetch the provider's current model catalog without exposing its API key to the renderer. */
export async function listProviderModels(id: ProviderId): Promise<ProviderModel[]> {
  const cfg = getProviderConfigs().find((c) => c.id === id)
  if (!cfg) throw new Error(`Unknown provider: ${id}`)

  const selected = cfg.model?.trim()
  if (id === 'sage') {
    return [
      { id: 'sage-vision', label: 'SAGE vision planner · vision', inputModalities: ['text', 'image'] },
      { id: 'sage-text', label: 'SAGE fast text', inputModalities: ['text'] }
    ]
  }
  if (!cfg.supportsModelListing || !cfg.baseUrl) {
    return selected ? [{ id: selected, label: selected }] : []
  }

  const key = getSecret(secretName.providerKey(id)) || ''
  if (!key && id !== 'ollama') {
    throw new Error(`Save your ${cfg.label} API key to load its live models.`)
  }

  const response = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/models`, {
    headers: key ? { Authorization: `Bearer ${key}` } : undefined,
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Could not load ${cfg.label} models (HTTP ${response.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`)
  }

  const payload = (await response.json()) as unknown
  const records = modelRecords(payload)
  const models = records
    .filter((record) => isSelectableTextModel(id, record))
    .map(toProviderModel)
    .filter((model): model is ProviderModel => model !== null)

  const deduped = Array.from(new Map(models.map((model) => [model.id, model])).values())
    .sort((a, b) => a.label.localeCompare(b.label))

  if (selected && !deduped.some((model) => model.id === selected)) {
    deduped.unshift({ id: selected, label: `${selected} (currently selected)` })
  }
  if (!deduped.length) throw new Error(`${cfg.label} returned no selectable text models.`)
  return deduped
}

function modelRecords(payload: unknown): ModelRecord[] {
  if (Array.isArray(payload)) return payload.filter(isModelRecord)
  if (!isModelRecord(payload)) return []
  const data = payload.data
  if (Array.isArray(data)) return data.filter(isModelRecord)
  const models = payload.models
  return Array.isArray(models) ? models.filter(isModelRecord) : []
}

function isModelRecord(value: unknown): value is ModelRecord & Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSelectableTextModel(provider: ProviderId, record: ModelRecord): boolean {
  if (provider !== 'together' || typeof record.type !== 'string') return true
  return ['chat', 'language', 'code'].includes(record.type.toLowerCase())
}

function toProviderModel(record: ModelRecord): ProviderModel | null {
  const rawId = typeof record.id === 'string' ? record.id : typeof record.name === 'string' ? record.name : ''
  const id = rawId.replace(/^models\//, '').trim()
  if (!id) return null
  const display = typeof record.display_name === 'string'
    ? record.display_name
    : typeof record.displayName === 'string'
      ? record.displayName
      : typeof record.id === 'string' && typeof record.name === 'string'
        ? record.name
        : ''
  const type = typeof record.type === 'string' ? record.type : undefined
  const rawContext = typeof record.context_length === 'number' ? record.context_length : record.contextLength
  const contextLength = typeof rawContext === 'number' ? rawContext : undefined
  const architecture = isModelRecord(record.architecture) ? record.architecture : undefined
  const inputModalities = Array.isArray(architecture?.input_modalities)
    ? architecture.input_modalities.filter((value): value is string => typeof value === 'string')
    : []
  const vision = inputModalities.some((modality) => modality.toLowerCase() === 'image')
  return {
    id,
    label: `${display && display !== id ? `${display} — ${id}` : id}${vision ? ' · vision' : ''}`,
    ...(type ? { type } : {}),
    ...(contextLength ? { contextLength } : {}),
    ...(inputModalities.length ? { inputModalities } : {})
  }
}

export async function testProvider(id: ProviderId): Promise<{ ok: boolean; message: string }> {
  try {
    const out = await chatWith(id, [{ role: 'user', content: 'Reply with the single word: ok' }], {
      maxTokens: 8
    })
    return { ok: true, message: out.trim().slice(0, 40) || 'ok' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/** Ask the model for JSON and parse it, tolerating code fences and prose. */
export function parseJson<T>(raw: string): T {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('{')
  const firstArr = s.indexOf('[')
  const start = firstArr !== -1 && (firstArr < first || first === -1) ? firstArr : first
  if (start > 0) s = s.slice(start)
  // trim trailing prose after the last closing bracket
  const lastObj = s.lastIndexOf('}')
  const lastArr = s.lastIndexOf(']')
  const end = Math.max(lastObj, lastArr)
  if (end !== -1) s = s.slice(0, end + 1)
  return JSON.parse(s) as T
}
