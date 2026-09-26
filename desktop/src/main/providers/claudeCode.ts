import { spawn } from 'child_process'
import type { Msg, ChatOpts } from './index'

/**
 * Driver for the local Claude Code CLI (`claude`).
 *
 * Runs headless single-shot: `claude -p --model <m> --output-format json -`
 * with the flattened prompt on stdin. Used for the agentic form-filling loop,
 * which benefits from a strong tool-use model the user already has installed.
 */
export function claudeCodeChat(messages: Msg[], model: string, opts: ChatOpts): Promise<string> {
  const prompt = flatten(messages)

  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_ENTRYPOINT

    const proc = spawn(
      'claude',
      ['-p', '--model', model, '--output-format', 'json', '-'],
      { env, stdio: ['pipe', 'pipe', 'pipe'] }
    )

    let out = ''
    let err = ''
    proc.stdout.on('data', (d) => (out += d.toString()))
    proc.stderr.on('data', (d) => (err += d.toString()))

    proc.on('error', (e) =>
      reject(new Error(`Claude Code CLI not runnable ('claude' on PATH?): ${e.message}`))
    )
    proc.on('close', (code) => {
      // The CLI emits a JSON envelope even on API errors — parse it first so we
      // surface the real reason (e.g. "Credit balance is too low") not "exited 1".
      try {
        const parsed = JSON.parse(out) as {
          result?: string
          error?: string
          is_error?: boolean
          subtype?: string
          total_cost_usd?: number
          usage?: {
            input_tokens?: number
            output_tokens?: number
          }
        }
        if (parsed.is_error || parsed.error) {
          reject(new Error(parsed.result || parsed.error || 'Claude Code returned an error'))
          return
        }
        if (parsed.usage || typeof parsed.total_cost_usd === 'number') {
          const inputTokens = parsed.usage?.input_tokens ?? 0
          const outputTokens = parsed.usage?.output_tokens ?? 0
          opts.onUsage?.({
            provider: 'claude-code',
            model,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            ...(typeof parsed.total_cost_usd === 'number' ? { costUsd: parsed.total_cost_usd } : {})
          })
        }
        resolve(parsed.result ?? '')
        return
      } catch {
        /* not JSON — fall through */
      }
      if (code !== 0) {
        reject(new Error(`Claude Code exited ${code}: ${(out || err).slice(0, 300)}`))
        return
      }
      resolve(out.trim())
    })

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

function flatten(messages: Msg[]): string {
  return messages
    .map((m) => {
      const content = typeof m.content === 'string'
        ? m.content
        : m.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n')
      if (m.role === 'system') return `[SYSTEM]\n${content}`
      if (m.role === 'assistant') return `[ASSISTANT]\n${content}`
      return content
    })
    .join('\n\n')
}
