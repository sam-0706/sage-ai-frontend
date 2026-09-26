import type { AtsType, Job } from '@shared/types'
import { classifyAts } from './classify'

/**
 * Lightweight enrichment for a pasted URL: fetch the page and pull title,
 * company, location, and JD text from JSON-LD JobPosting when present, else
 * from <title> / meta. Best-effort; the apply loop works even if this is thin.
 */
export async function enrichJob(url: string): Promise<Omit<Job, 'id' | 'discoveredAt'>> {
  const atsType: AtsType = classifyAts(url)
  const base: Omit<Job, 'id' | 'discoveredAt'> = {
    url,
    atsType,
    title: '',
    company: '',
    location: '',
    jdText: ''
  }

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 SAGE-Desktop/1.0' },
      signal: AbortSignal.timeout(15000)
    })
    if (!resp.ok) return base
    const html = await resp.text()

    // JSON-LD JobPosting
    const ld = extractJsonLd(html)
    if (ld) {
      base.title = str(ld.title) || base.title
      base.company = str(ld.hiringOrganization?.name) || base.company
      base.location = jobLocation(ld) || base.location
      base.jdText = stripHtml(str(ld.description)).slice(0, 8000)
    }

    if (!base.title) base.title = titleTag(html)
    if (!base.company) base.company = hostCompany(url)
    return base
  } catch {
    base.company = hostCompany(url)
    return base
  }
}

interface JobLd {
  '@type'?: string | string[]
  title?: unknown
  description?: unknown
  hiringOrganization?: { name?: unknown }
  jobLocation?: unknown
}

function extractJsonLd(html: string): JobLd | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const m of blocks) {
    try {
      const parsed = JSON.parse(m[1].trim())
      const arr = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] || [])]
      for (const node of arr) {
        const t = node?.['@type']
        if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) return node as JobLd
      }
    } catch {
      /* ignore malformed ld+json */
    }
  }
  return null
}

interface Addr {
  addressLocality?: string
  addressRegion?: string
  addressCountry?: string
}
function jobLocation(ld: JobLd): string {
  const loc = ld.jobLocation as { address?: Addr } | Array<{ address?: Addr }> | undefined
  const one = Array.isArray(loc) ? loc[0] : loc
  const a = one?.address
  if (!a) return ''
  return [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(', ')
}

function titleTag(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? decode(m[1].trim()).slice(0, 160) : ''
}
function hostCompany(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').split('.')[0]
  } catch {
    return ''
  }
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function stripHtml(s: string): string {
  return decode(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
}
function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}
