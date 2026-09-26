import type { AtsType } from '@shared/types'

/** Classify a job URL to an ATS type from its host/path. */
export function classifyAts(url: string): AtsType {
  let host = ''
  let path = ''
  try {
    const u = new URL(url)
    host = u.hostname.toLowerCase()
    path = u.pathname.toLowerCase()
  } catch {
    return 'generic'
  }

  if (host.includes('greenhouse.io') || host.includes('boards.greenhouse')) return 'greenhouse'
  if (host.includes('lever.co')) return 'lever'
  if (host.includes('ashbyhq.com') || host.includes('jobs.ashby')) return 'ashby'
  if (host.includes('myworkdayjobs.com') || host.includes('workday')) return 'workday'
  if (host.includes('icims.com')) return 'icims'
  if (host.includes('taleo.net') || host.includes('taleo')) return 'taleo'
  if (host.includes('linkedin.com') && path.includes('/jobs')) return 'linkedin'
  return 'generic'
}

export const ATS_LABEL: Record<AtsType, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workday: 'Workday',
  icims: 'iCIMS',
  taleo: 'Taleo',
  linkedin: 'LinkedIn',
  generic: 'Generic / unknown'
}
