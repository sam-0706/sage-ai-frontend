import type { Profile } from '@shared/types'

/** Render the profile as a compact, readable facts block for the planner. */
export function profileFacts(p: Profile): string {
  const L: string[] = []
  const add = (label: string, value: string | string[] | undefined) => {
    const rendered = Array.isArray(value) ? value.filter(Boolean).join(', ') : value?.trim()
    if (rendered) L.push(`${label}: ${rendered}`)
  }
  const per = p.personal
  const structuredFullName = [per.firstName, per.middleName, per.lastName, per.nameSuffix]
    .filter(Boolean)
    .join(' ') || per.fullName
  add('First name', per.firstName)
  add('Middle name', per.middleName)
  add('Last name', per.lastName)
  add('Name suffix', per.nameSuffix)
  add('Full name', structuredFullName)
  add('Preferred name', per.preferredName)
  add('Email', per.email)
  add('Phone', per.phone)
  add('Phone country code', per.phoneCountryCode)
  add('Address', [per.address, per.city, per.state, per.postalCode, per.country])
  const loc = [per.city, per.state, per.country].filter(Boolean).join(', ')
  add('Current location (use for current location/location fields)', loc)
  add('Region', per.region)
  add('Country of residence', per.countryOfResidence)
  add('Nationality', per.nationality)
  add('Time zone', per.timeZone)
  add('LinkedIn', per.linkedinUrl)
  add('GitHub', per.githubUrl)
  add('Portfolio', per.portfolioUrl)
  add('Website', per.websiteUrl)

  const wa = p.workAuthorization
  add('General work authorization', wa.legallyAuthorized)
  add('General sponsorship requirement', wa.requireSponsorship)
  add('Authorized countries', wa.authorizedCountries)
  add('Sponsorship required in', wa.sponsorshipCountries)
  add('Authorized to work in the United States', wa.usAuthorized)
  add('Requires United States sponsorship', wa.usSponsorship)
  add('Authorized to work in the United Kingdom', wa.ukAuthorized)
  add('Authorized to work in the EU/EEA', wa.euAuthorized)
  add('Authorized to work in Canada', wa.canadaAuthorized)
  add('Work permit / note', wa.workPermitType)
  add('Work permit expiry', wa.workPermitExpiry)

  const c = p.compensation
  add('Salary expectation', [c.salaryExpectation, c.currency])
  if (c.salaryMin || c.salaryMax) add('Salary range', `${c.salaryMin}–${c.salaryMax} ${c.currency}`)
  add('Current base pay', [c.currentBase, c.currentCurrency, c.payPeriod])
  add('Current total compensation', [c.currentTotal, c.currentCurrency, c.payPeriod])
  add('Expected base pay', [c.expectedBase, c.expectedCurrency, c.payPeriod])
  add('Expected total compensation', [c.expectedTotal, c.expectedCurrency, c.payPeriod])
  add('Bonus expectation', c.bonus)
  add('Equity expectation', c.equity)
  add('Compensation negotiable', c.negotiable)
  add('Compensation note', c.note)

  const e = p.experience
  add('Years of experience', e.yearsTotal)
  add('Education level', e.educationLevel)
  add('Current title', e.currentTitle)
  add('Current company', e.currentCompany)
  add('Target role', e.targetRole)

  const prefs = p.applicationPreferences
  add('Comfortable fully onsite', prefs.comfortableFullyOnsite)
  add('Willing to relocate', prefs.willingToRelocate)
  add('Open to remote work', prefs.openToRemote)
  add('Open to hybrid work', prefs.openToHybrid)
  add('Open to onsite work', prefs.openToOnsite)
  add('Open to United States remote roles', prefs.openToUSRemote)
  add('Open to United States contract roles', prefs.openToUSContract)
  add('Open to international contract roles', prefs.openToInternationalContract)
  add('Preferred work modes', prefs.preferredWorkModes)
  add('Employment types', prefs.employmentTypes)
  add('Target countries', prefs.targetCountries)
  add('Preferred time zones', prefs.preferredTimeZones)
  add('Willing to travel', prefs.willingToTravel)
  add('Maximum travel', prefs.maxTravelPercent)
  add('Notice period', prefs.noticePeriod)
  add('Available start date', prefs.availableStartDate)

  const screening = p.screening
  add('Restrictive covenant', screening.restrictiveCovenant)
  add('Currently employed by a brand partner', screening.currentBrandPartner)
  add('Personally deployed AI to production', screening.deployedAiToProduction)
  add('Previously employed by companies', screening.previouslyEmployedByCompanies)
  add('Security clearance', screening.securityClearance)
  add('Conflict of interest', screening.conflictOfInterest)
  add('Background-check consent', screening.backgroundCheckConsent)
  add('Drug-test consent', screening.drugTestConsent)
  add('Criminal-history note', screening.criminalHistoryNote)
  add('Referral source', screening.referralSource)

  const narratives = p.narratives
  add('Professional summary', narratives.professionalSummary)
  add('Technical highlights', narratives.technicalHighlights)
  add('AI production example', narratives.aiProductionExample)
  add('Public work description', narratives.publicWorkDescription)
  add('Leadership summary', narratives.leadershipSummary)
  add('Role motivation', narratives.motivation)
  add('Cover-letter notes', narratives.coverLetterNotes)

  const sk = p.skills
  const skills = [...sk.languages, ...sk.frameworks, ...sk.devops, ...sk.databases, ...sk.tools]
  if (skills.length) L.push(`Skills: ${skills.join(', ')}`)

  if (p.resumeFacts.school) L.push(`School: ${p.resumeFacts.school}`)
  add('Education history', p.resumeFacts.education)
  add('Projects', p.resumeFacts.projects)
  add('Certifications', p.resumeFacts.certifications)
  add('Awards', p.resumeFacts.awards)
  add('Publications', p.resumeFacts.publications)
  add('Patents', p.resumeFacts.patents)
  add('Spoken languages', p.resumeFacts.spokenLanguages)
  add('Professional memberships', p.resumeFacts.professionalMemberships)
  add('Resume metrics', p.resumeFacts.metrics)
  if (p.roles.length) {
    L.push('Experience:')
    for (const r of p.roles.slice(0, 6)) {
      L.push(`  - ${r.title} @ ${r.company} (${r.start}–${r.end})`)
    }
  }

  const eeo = p.eeo
  L.push(
    `EEO (voluntary): gender=${eeo.gender}; pronouns=${eeo.pronouns}; Hispanic/Latino=${eeo.hispanicLatino}; race/ethnicity=${eeo.raceEthnicity}; veteran=${eeo.veteranStatus}; disability=${eeo.disabilityStatus}`
  )
  return L.join('\n')
}

/** Common label synonyms → canonical profile path, for deterministic fillers. */
export const FIELD_SYNONYMS: Record<string, string> = {
  'first name': 'personal.firstName',
  'middle name': 'personal.middleName',
  'last name': 'personal.lastName',
  'name suffix': 'personal.nameSuffix',
  'full name': 'personal.fullName',
  'name': 'personal.fullName',
  'email': 'personal.email',
  'phone': 'personal.phone',
  'phone country code': 'personal.phoneCountryCode',
  'mobile': 'personal.phone',
  'linkedin': 'personal.linkedinUrl',
  'github': 'personal.githubUrl',
  'website': 'personal.websiteUrl',
  'portfolio': 'personal.portfolioUrl',
  'city': 'personal.city',
  'state': 'personal.state',
  'country': 'personal.country',
  'zip': 'personal.postalCode',
  'postal': 'personal.postalCode',
  'address': 'personal.address',
  'salary': 'compensation.salaryExpectation',
  'sponsorship': 'workAuthorization.requireSponsorship',
  'authorized': 'workAuthorization.legallyAuthorized'
}
