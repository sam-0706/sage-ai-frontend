// Thin typed helpers over window.sage.request (the token stays in the main process).

export interface ApiError extends Error {
  status?: number
  code?: string
  details?: unknown
}

export const api = {
  get: <T = any>(path: string) => window.sage.request<T>('GET', path),
  post: <T = any>(path: string, body: unknown = {}) => window.sage.request<T>('POST', path, body),
  put: <T = any>(path: string, body: unknown = {}) => window.sage.request<T>('PUT', path, body),
  patch: <T = any>(path: string, body: unknown = {}) => window.sage.request<T>('PATCH', path, body),
  del: <T = any>(path: string) => window.sage.request<T>('DELETE', path)
}

export function errorMessage(e: unknown): string {
  const err = e as ApiError
  if (err?.code === 'quota_exceeded') return `${err.message}. Upgrade your plan in Settings to continue.`
  return err?.message || 'Something went wrong'
}

export const newKey = (): string => crypto.randomUUID()

// ---------------------------------------------------------------- types used across screens
export type Mode = 'student' | 'professional' | 'founder'

export interface Me {
  user: { id: string; email: string; full_name: string | null; phone: string | null; mode: Mode; role: string; status: string }
  subscription: Subscription | null
  flags: Record<string, boolean>
}

export interface Meter { allowance: number; used: number; remaining: number }
export interface Subscription {
  plan_code: string
  plan_name: string
  is_test: boolean
  period_end: string | null
  voice: { allowance_seconds: number; used_seconds: number; remaining_seconds: number }
  ai_requests: Meter
  chat_messages: Meter
  autoapply_calls: Meter
}

export interface Card {
  id: string
  deck_id: string
  position: number
  concept: string
  card_type: string
  front: string
  back: string
  hint: string | null
  mnemonic: string | null
  difficulty: 'easy' | 'medium' | 'hard'
  reps: number
  lapses: number
  interval_days: number
  due_at: string
}

export interface DeckSummary {
  id: string
  topic: string
  title: string
  level: string | null
  exam: string | null
  card_count: number
  due_now: number
  learned: number
  last_score: number | null
  last_readiness: Readiness | null
  updated_at: string
}

export type Readiness = 'not_ready' | 'developing' | 'nearly_ready' | 'ready'

export interface Deck extends Omit<DeckSummary, 'due_now' | 'learned' | 'last_score' | 'last_readiness'> {
  coach_kind?: 'study' | 'interview'
  summary: string
  key_concepts: { name: string; explanation: string }[]
  quick_tips: string[]
  common_mistakes: string[]
  cards: Card[]
  assessments: { id: string; call_id: string; overall_score: number | null; readiness: Readiness | null; status: string; created_at: string }[]
  stats: { total: number; due_now: number; new: number; learned: number }
}

export interface Assessment {
  id: string
  call_id: string
  deck_id: string | null
  deck_title: string | null
  topic: string | null
  overall_score: number
  readiness: Readiness
  is_simulated: boolean
  duration_seconds: number | null
  created_at: string
  output: {
    overall_score: number
    readiness: Readiness
    summary: string
    questions: { concept: string; question: string; student_answer: string; verdict: 'correct' | 'partially_correct' | 'incorrect' | 'not_answered'; feedback: string }[]
    concepts: { concept: string; mastery: 'strong' | 'partial' | 'weak' | 'not_assessed'; score: number; evidence: string }[]
    strengths: string[]
    gaps: string[]
    misconceptions: { misconception: string; correction: string }[]
    study_plan: { step: string; focus_concept: string; minutes: number }[]
    cards_to_review: string[]
    confidence: number
    transcript_gaps: string[]
    encouragement: string
  }
}

export interface CallState {
  id: string
  status: 'requested' | 'dispatching' | 'dispatched' | 'in_progress' | 'completed' | 'no_answer' | 'busy' | 'failed' | 'cancelled'
  transcript_status: string
  extraction_status: string
  is_simulated: boolean
  duration_seconds: number | null
  error: string | null
  destination: string
  assessment?: Assessment | null
  plan?: { id: string; status: string } | null
}

export interface Preflight {
  enabled: boolean
  purpose: string
  destinations: { number: string; masked: string }[]
  expected_duration_sec: number
  estimated_minutes: number
  remaining_voice_seconds: number
  may_exceed_allowance: boolean
  consent_text: string
  consent_version: string
  agent_disclosure: string
  live_call: CallState | null
}

export const READINESS_LABEL: Record<Readiness, string> = {
  not_ready: 'Not ready yet',
  developing: 'Developing',
  nearly_ready: 'Nearly ready',
  ready: 'Exam ready'
}
export const READINESS_TONE: Record<Readiness, 'destructive' | 'warning' | 'primary' | 'success'> = {
  not_ready: 'destructive',
  developing: 'warning',
  nearly_ready: 'primary',
  ready: 'success'
}
