import type { ProviderId } from '@shared/types'
import type { Msg, ChatOpts } from './index'

/**
 * OpenAI-compatible chat completion over HTTP.
 * Works for DeepSeek, OpenAI, OpenRouter, Together, Gemini (compat layer), Ollama, and any
 * OpenAI-compatible endpoint. Retries on 429/503 with backoff.
 */
export async function httpChat(
  provider: ProviderId,
  baseUrl: string,
  model: string,
  apiKey: string,
  messages: Msg[],
  opts: ChatOpts
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0,
    max_tokens: opts.maxTokens ?? 4096
  }
  if (opts.json) body.response_format = { type: 'json_object' }

  const maxRetries = 4
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(opts.headers ?? {})
      },
      body: JSON.stringify(body)
    })

    if (provider === 'sage' && resp.status === 402) {
      throw new Error('Your SAGE plan has used all included auto-apply agent calls. Upgrade in Settings → Plan, or add your own provider key.')
    }
    if (resp.status === 429 || resp.status === 503) {
      const wait = Math.min(2000 * 2 ** attempt, 20000)
      await new Promise((r) => setTimeout(r, wait))
      continue
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      // Vision is opportunistic across generic OpenAI-compatible providers.
      // If the selected model is text-only, retry the identical planner turn
      // with the DOM/text context rather than failing the application.
      if (
        [400, 404, 422].includes(resp.status) &&
        messagesContainImages(body.messages) &&
        /image|vision|multimodal|modality|no endpoints/i.test(text) &&
        /unsupported|not support|invalid|no endpoints|cannot|does not accept/i.test(text)
      ) {
        body.messages = stripImages(body.messages)
        continue
      }
      // Some OpenAI-compatible models do not implement response_format even
      // though their provider does. Keep the strict JSON prompt and retry once
      // without the transport hint instead of making that model unusable.
      if (
        resp.status === 400 &&
        'response_format' in body &&
        /response[_ -]?format|json[_ -]?object|structured output/i.test(text) &&
        /unsupported|not support|invalid|unknown|not available/i.test(text)
      ) {
        delete body.response_format
        continue
      }
      throw new Error(`LLM HTTP ${resp.status}: ${text.slice(0, 300)}`)
    }
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: {
        prompt_tokens?: number
        input_tokens?: number
        completion_tokens?: number
        output_tokens?: number
        total_tokens?: number
        cost?: number | string
        total_cost?: number | string
      }
      cost?: number | string
    }
    const inputTokens = finiteNumber(data.usage?.prompt_tokens ?? data.usage?.input_tokens) ?? 0
    const outputTokens = finiteNumber(data.usage?.completion_tokens ?? data.usage?.output_tokens) ?? 0
    const totalTokens = finiteNumber(data.usage?.total_tokens) ?? inputTokens + outputTokens
    const costUsd = finiteNumber(data.usage?.cost ?? data.usage?.total_cost ?? data.cost)
    if (data.usage || costUsd !== undefined) {
      opts.onUsage?.({
        provider,
        model,
        inputTokens,
        outputTokens,
        totalTokens,
        ...(costUsd !== undefined ? { costUsd } : {})
      })
    }
    return data.choices?.[0]?.message?.content ?? ''
  }
  throw new Error('LLM request failed after retries (rate limited).')
}

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(number) ? number : undefined
}

function messagesContainImages(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  return value.some((message) => {
    if (!message || typeof message !== 'object') return false
    const content = (message as { content?: unknown }).content
    return Array.isArray(content) && content.some(
      (part) => part && typeof part === 'object' && (part as { type?: unknown }).type === 'image_url'
    )
  })
}

function stripImages(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  return value.map((message) => {
    if (!message || typeof message !== 'object') return message
    const item = message as Record<string, unknown>
    if (!Array.isArray(item.content)) return message
    const text = item.content
      .filter((part) => part && typeof part === 'object' && (part as { type?: unknown }).type === 'text')
      .map((part) => (part as { text?: unknown }).text)
      .filter((part): part is string => typeof part === 'string')
      .join('\n')
    return { ...item, content: text }
  })
}
