import type { Profile } from './types'

export function createBlankProfile(): Profile {
  return {
    personal: {
      firstName: '', middleName: '', lastName: '', nameSuffix: '', fullName: '', preferredName: '', email: '',
      phone: '', phoneCountryCode: '', address: '',
      city: '', state: '', region: '', country: '', countryOfResidence: '', nationality: '', timeZone: '',
      postalCode: '', linkedinUrl: '', githubUrl: '', portfolioUrl: '', websiteUrl: ''
    },
    workAuthorization: {
      legallyAuthorized: '', requireSponsorship: '', workPermitType: '', authorizedCountries: [],
      sponsorshipCountries: [], usAuthorized: '', usSponsorship: '', ukAuthorized: '', euAuthorized: '',
      canadaAuthorized: '', workPermitExpiry: ''
    },
    compensation: {
      salaryExpectation: '', currency: 'USD', salaryMin: '', salaryMax: '', note: '', currentBase: '',
      currentTotal: '', currentCurrency: 'INR', expectedBase: '', expectedTotal: '', expectedCurrency: 'USD',
      payPeriod: 'Annual', bonus: '', equity: '', negotiable: ''
    },
    experience: { yearsTotal: '', educationLevel: '', currentTitle: '', currentCompany: '', targetRole: '' },
    applicationPreferences: {
      comfortableFullyOnsite: '', willingToRelocate: '', openToRemote: '', openToHybrid: '', openToOnsite: '',
      openToUSRemote: '', openToUSContract: '', openToInternationalContract: '', preferredWorkModes: [],
      employmentTypes: [], targetCountries: [], preferredTimeZones: [], willingToTravel: '', maxTravelPercent: '',
      noticePeriod: '', availableStartDate: ''
    },
    screening: {
      restrictiveCovenant: '', currentBrandPartner: '', deployedAiToProduction: '',
      previouslyEmployedByCompanies: [], securityClearance: '', conflictOfInterest: '',
      backgroundCheckConsent: '', drugTestConsent: '', criminalHistoryNote: '', referralSource: ''
    },
    narratives: {
      professionalSummary: '', technicalHighlights: '', aiProductionExample: '', publicWorkDescription: '',
      leadershipSummary: '', motivation: '', coverLetterNotes: ''
    },
    skills: { languages: [], frameworks: [], devops: [], databases: [], tools: [] },
    roles: [],
    resumeFacts: {
      companies: [], projects: [], school: '', metrics: [], education: [], certifications: [], awards: [],
      publications: [], patents: [], spokenLanguages: [], professionalMemberships: []
    },
    eeo: {
      gender: 'Decline to self-identify', pronouns: '', hispanicLatino: 'Decline to self-identify',
      raceEthnicity: 'Decline to self-identify', veteranStatus: 'Decline to self-identify',
      disabilityStatus: 'Decline to self-identify'
    }
  }
}

export function normalizeProfile(input: Partial<Profile> | null | undefined): Profile {
  const base = createBlankProfile()
  const normalized = deepMerge(base, input ?? {})
  if (
    (!normalized.personal.firstName || !normalized.personal.middleName || !normalized.personal.lastName) &&
    normalized.personal.fullName.trim()
  ) {
    const parts = normalized.personal.fullName.trim().split(/\s+/)
    if (!normalized.personal.firstName) normalized.personal.firstName = parts[0] || ''
    if (!normalized.personal.lastName) normalized.personal.lastName = parts.length > 1 ? parts.at(-1) || '' : ''
    if (!normalized.personal.middleName && parts.length > 2) {
      normalized.personal.middleName = parts.slice(1, -1).join(' ')
    }
  }
  if (!normalized.personal.fullName.trim()) {
    normalized.personal.fullName = [
      normalized.personal.firstName,
      normalized.personal.middleName,
      normalized.personal.lastName,
      normalized.personal.nameSuffix
    ].filter(Boolean).join(' ')
  }
  return normalized
}

function deepMerge<T>(base: T, over: unknown): T {
  if (Array.isArray(base)) return (Array.isArray(over) ? over : base) as T
  if (base && typeof base === 'object') {
    const source = over && typeof over === 'object' ? (over as Record<string, unknown>) : {}
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(base as Record<string, unknown>)) {
      result[key] = deepMerge(value, source[key])
    }
    for (const [key, value] of Object.entries(source)) {
      if (!(key in result)) result[key] = value
    }
    return result as T
  }
  return (over === undefined || over === null ? base : over) as T
}
