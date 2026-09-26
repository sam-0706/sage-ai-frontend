import type { Profile } from '@shared/types'
import { createBlankProfile, normalizeProfile } from '@shared/profileDefaults'
import { chatForTask, parseJson } from '../providers'

const EMPTY: Profile = createBlankProfile()

const SYSTEM = `You extract structured data from a resume into strict JSON.
Rules:
- Only use facts present in the resume. NEVER invent employers, dates, metrics, or contact details.
- Leave a field as an empty string "" or empty array [] if the resume does not state it.
- Extract every explicitly stated name component, contact/location detail, role, date, bullet, project,
  education item, certification, award, publication, patent, spoken language, professional membership,
  technology, and quantified outcome that fits the schema.
- Do NOT guess salary, work authorization, preferences, demographic identity, disability, or veteran
  status — leave those fields at their schema defaults for the user to review.
- Keep bullet points verbatim or lightly trimmed; never fabricate achievements.
- Return ONLY the JSON object, no prose.`

function schemaHint(): string {
  return JSON.stringify(EMPTY, null, 2)
}

/** Extract a Profile from resume text. Merges over EMPTY so missing keys are safe. */
export async function extractProfile(resumeText: string): Promise<Profile> {
  const user = `Resume text:\n"""\n${resumeText.slice(0, 16000)}\n"""\n\nReturn a JSON object with EXACTLY this shape (fill what the resume states, leave the rest blank):\n${schemaHint()}`

  const raw = await chatForTask('extract', [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user }
  ], { json: true, maxTokens: 4096 })

  let parsed: Partial<Profile>
  try {
    parsed = parseJson<Partial<Profile>>(raw)
  } catch {
    parsed = {}
  }
  return normalizeProfile(parsed)
}

export function emptyProfile(): Profile {
  return createBlankProfile()
}
