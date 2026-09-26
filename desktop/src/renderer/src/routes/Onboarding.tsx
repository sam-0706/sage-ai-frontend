import { useEffect, useRef, useState } from 'react'
import type { Profile } from '@shared/types'
import { createBlankProfile } from '@shared/profileDefaults'
import { useAuta } from '@/state'
import { Button, Card, Field, Input, Select, Spinner, Textarea, type SelectOption } from '@/components/ui'
import { FileUp, Sparkles, Check, AlertTriangle, PencilLine } from 'lucide-react'

export const blankProfile = createBlankProfile

const unspecified = { value: '', label: 'Not specified — ask me if required' }
const yesNoOptions: SelectOption[] = [unspecified, 'Yes', 'No']
const yesNoDeclineOptions: SelectOption[] = [unspecified, 'Yes', 'No', 'Decline to self-identify']
const regionOptions: SelectOption[] = [unspecified, 'APAC', 'EMEA', 'North America', 'Latin America', 'Global / Other']
const currencyOptions: SelectOption[] = [unspecified, 'USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'JPY']
const payPeriodOptions: SelectOption[] = [unspecified, 'Annual', 'Monthly', 'Weekly', 'Daily', 'Hourly']
const educationOptions: SelectOption[] = [
  unspecified,
  'High school',
  'Associate degree',
  "Bachelor's degree",
  "Master's degree",
  'Doctorate / PhD',
  'Professional degree',
  'Other'
]
const genderOptions: SelectOption[] = [unspecified, 'Female', 'Male', 'Non-binary', 'Decline to self-identify']
const pronounOptions: SelectOption[] = [unspecified, 'She / Her', 'He / Him', 'They / Them', 'Decline to self-identify']
const raceEthnicityOptions: SelectOption[] = [
  unspecified,
  'American Indian or Alaska Native',
  'Asian',
  'Black or African American',
  'Hispanic or Latino',
  'Middle Eastern or North African',
  'Native Hawaiian or Other Pacific Islander',
  'White',
  'Two or more races',
  'Decline to self-identify'
]
const veteranOptions: SelectOption[] = [
  unspecified,
  'I am not a protected veteran',
  'I identify as one or more classifications of a protected veteran',
  'Decline to self-identify'
]
const disabilityOptions: SelectOption[] = [
  unspecified,
  'Yes',
  'No',
  'Decline to self-identify'
]

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { refreshProfile } = useAuta()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stage, setStage] = useState<'upload' | 'extracting' | 'edit'>('upload')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.auta.getProfile().then((p) => {
      if (p) {
        setProfile(p)
        setStage('edit')
      }
    })
  }, [])

  const handleFile = async (file: File) => {
    setError('')
    setFileName(file.name)
    setStage('extracting')
    try {
      const bytes = await file.arrayBuffer()
      const { text } = await window.auta.uploadResume(bytes, file.name)
      const extracted = await window.auta.extractProfile(text)
      setProfile(extracted)
      setStage('edit')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStage('upload')
    }
  }

  const save = async () => {
    if (!profile) return
    await window.auta.saveProfile(profile)
    await refreshProfile()
    setSaved(true)
    setTimeout(() => onDone(), 600)
  }

  if (stage === 'upload' || stage === 'extracting') {
    return (
      <div className="relative flex h-full items-center justify-center overflow-hidden p-10">
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-35" />
        <Card className="relative w-[560px] p-10 text-center animate-fade-in">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Sparkles className="h-8 w-8" />
          </div>
          <h1 className="mb-2 font-display text-2xl font-bold">Build your application profile</h1>
          <p className="mx-auto mb-6 max-w-[48ch] text-sm leading-relaxed text-muted-foreground">
            Drop your resume in — SAGE extracts a structured profile you can review and edit. Nothing is used
            until you confirm it.
          </p>

          {stage === 'extracting' ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Spinner className="h-6 w-6 text-primary" />
              <p className="text-sm text-muted-foreground">Extracting from {fileName}…</p>
            </div>
          ) : (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f) handleFile(f)
                }}
                className="flex w-full flex-col items-center gap-3 rounded-xl bg-background p-10 shadow-[inset_0_0_0_1px_oklch(var(--border))] transition-[background-color,box-shadow] hover:bg-secondary hover:shadow-[inset_0_0_0_2px_oklch(var(--primary)/0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FileUp className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Click or drag a PDF / TXT resume</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,.md,.docx"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </>
          )}

          {error && (
            <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-left text-xs text-destructive">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
              </div>
              <div className="mt-1 pl-6 text-destructive/80">
                Add a key in Settings, switch extraction to Claude Code, or enter your details by hand below.
              </div>
            </div>
          )}

          {stage === 'upload' && (
            <button
              onClick={() => {
                setProfile(blankProfile())
                setStage('edit')
              }}
              className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground no-drag"
            >
              <PencilLine className="h-3.5 w-3.5" /> or enter details manually
            </button>
          )}
          <p className="mt-6 text-[10px] leading-relaxed text-muted-foreground/65">Your resume and extracted profile stay on this device. You can review every field before SAGE uses it.</p>
        </Card>
      </div>
    )
  }

  if (!profile) return null
  return <ProfileForm profile={profile} setProfile={setProfile} onSave={save} onReplaceResume={handleFile} saved={saved} />
}

export function ProfileForm({
  profile,
  setProfile,
  onSave,
  onReplaceResume,
  saved
}: {
  profile: Profile
  setProfile: (p: Profile) => void
  onSave: () => void
  onReplaceResume: (file: File) => Promise<void>
  saved: boolean
}) {
  const p = profile
  const replaceResumeRef = useRef<HTMLInputElement>(null)
  const set = (path: string, value: unknown) => {
    const next = structuredClone(p)
    const parts = path.split('.')
    let obj: Record<string, unknown> = next as unknown as Record<string, unknown>
    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]] as Record<string, unknown>
    obj[parts[parts.length - 1]] = value
    setProfile(next)
  }
  const csv = (arr: string[]) => arr.join(', ')
  const toArr = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
  const lines = (arr: string[]) => arr.join('\n')
  const toLines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

  return (
    <div className="h-full overflow-y-auto px-8 pb-12 pt-12">
      <div className="mx-auto max-w-4xl">
      <div className="mb-7 flex items-center justify-between gap-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> APPLICATION IDENTITY</div>
          <h1 className="font-display text-[2rem] font-bold tracking-[-0.04em]">Your profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review the facts SAGE can use. Empty fields stay empty; the agent never invents them.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={replaceResumeRef}
            type="file"
            accept=".pdf,.txt,.md,.docx"
            className="hidden"
            onChange={(event) => event.target.files?.[0] && void onReplaceResume(event.target.files[0])}
          />
          <Button variant="outline" onClick={() => replaceResumeRef.current?.click()}>
            <FileUp className="h-4 w-4" /> Re-extract résumé
          </Button>
          <Button onClick={onSave} size="lg">
            {saved ? <Check className="h-4 w-4" /> : null}
            {saved ? 'Saved' : 'Save profile'}
          </Button>
        </div>
      </div>

      <Section title="Personal">
        <Field label="First name"><Input value={p.personal.firstName} onChange={(e) => set('personal.firstName', e.target.value)} /></Field>
        <Field label="Middle name"><Input value={p.personal.middleName} onChange={(e) => set('personal.middleName', e.target.value)} /></Field>
        <Field label="Last name"><Input value={p.personal.lastName} onChange={(e) => set('personal.lastName', e.target.value)} /></Field>
        <Field label="Name suffix"><Input value={p.personal.nameSuffix} onChange={(e) => set('personal.nameSuffix', e.target.value)} placeholder="Jr., Sr., III" /></Field>
        <Field label="Full name"><Input value={p.personal.fullName} onChange={(e) => set('personal.fullName', e.target.value)} /></Field>
        <Field label="Preferred name"><Input value={p.personal.preferredName} onChange={(e) => set('personal.preferredName', e.target.value)} /></Field>
        <Field label="Email"><Input value={p.personal.email} onChange={(e) => set('personal.email', e.target.value)} /></Field>
        <Field label="Phone"><Input value={p.personal.phone} onChange={(e) => set('personal.phone', e.target.value)} /></Field>
        <Field label="Phone country code"><Input value={p.personal.phoneCountryCode} onChange={(e) => set('personal.phoneCountryCode', e.target.value)} placeholder="+91" /></Field>
        <Field label="Street address"><Input value={p.personal.address} onChange={(e) => set('personal.address', e.target.value)} /></Field>
        <Field label="City"><Input value={p.personal.city} onChange={(e) => set('personal.city', e.target.value)} /></Field>
        <Field label="State / Province"><Input value={p.personal.state} onChange={(e) => set('personal.state', e.target.value)} /></Field>
        <Field label="Region"><Select value={p.personal.region} options={regionOptions} onChange={(e) => set('personal.region', e.target.value)} /></Field>
        <Field label="Country"><Input value={p.personal.country} onChange={(e) => set('personal.country', e.target.value)} /></Field>
        <Field label="Country of residence"><Input value={p.personal.countryOfResidence} onChange={(e) => set('personal.countryOfResidence', e.target.value)} /></Field>
        <Field label="Nationality"><Input value={p.personal.nationality} onChange={(e) => set('personal.nationality', e.target.value)} /></Field>
        <Field label="Time zone"><Input value={p.personal.timeZone} onChange={(e) => set('personal.timeZone', e.target.value)} placeholder="Asia/Kolkata" /></Field>
        <Field label="Postal code"><Input value={p.personal.postalCode} onChange={(e) => set('personal.postalCode', e.target.value)} /></Field>
        <Field label="LinkedIn URL"><Input value={p.personal.linkedinUrl} onChange={(e) => set('personal.linkedinUrl', e.target.value)} /></Field>
        <Field label="GitHub URL"><Input value={p.personal.githubUrl} onChange={(e) => set('personal.githubUrl', e.target.value)} /></Field>
        <Field label="Portfolio URL"><Input value={p.personal.portfolioUrl} onChange={(e) => set('personal.portfolioUrl', e.target.value)} /></Field>
        <Field label="Website URL"><Input value={p.personal.websiteUrl} onChange={(e) => set('personal.websiteUrl', e.target.value)} /></Field>
      </Section>

      <Section title="Work authorization">
        <Field label="Generally authorized to work"><Select value={p.workAuthorization.legallyAuthorized} options={yesNoOptions} onChange={(e) => set('workAuthorization.legallyAuthorized', e.target.value)} /></Field>
        <Field label="Generally requires sponsorship"><Select value={p.workAuthorization.requireSponsorship} options={yesNoOptions} onChange={(e) => set('workAuthorization.requireSponsorship', e.target.value)} /></Field>
        <Field label="Authorized countries" hint="Comma-separated country names."><Input value={csv(p.workAuthorization.authorizedCountries)} onChange={(e) => set('workAuthorization.authorizedCountries', toArr(e.target.value))} /></Field>
        <Field label="Countries requiring sponsorship"><Input value={csv(p.workAuthorization.sponsorshipCountries)} onChange={(e) => set('workAuthorization.sponsorshipCountries', toArr(e.target.value))} /></Field>
        <Field label="Authorized to work in the US"><Select value={p.workAuthorization.usAuthorized} options={yesNoOptions} onChange={(e) => set('workAuthorization.usAuthorized', e.target.value)} /></Field>
        <Field label="Requires US sponsorship"><Select value={p.workAuthorization.usSponsorship} options={yesNoOptions} onChange={(e) => set('workAuthorization.usSponsorship', e.target.value)} /></Field>
        <Field label="Authorized to work in the UK"><Select value={p.workAuthorization.ukAuthorized} options={yesNoOptions} onChange={(e) => set('workAuthorization.ukAuthorized', e.target.value)} /></Field>
        <Field label="Authorized to work in the EU / EEA"><Select value={p.workAuthorization.euAuthorized} options={yesNoOptions} onChange={(e) => set('workAuthorization.euAuthorized', e.target.value)} /></Field>
        <Field label="Authorized to work in Canada"><Select value={p.workAuthorization.canadaAuthorized} options={yesNoOptions} onChange={(e) => set('workAuthorization.canadaAuthorized', e.target.value)} /></Field>
        <Field label="Work permit / note"><Input value={p.workAuthorization.workPermitType} onChange={(e) => set('workAuthorization.workPermitType', e.target.value)} /></Field>
        <Field label="Work permit expiry"><Input value={p.workAuthorization.workPermitExpiry} onChange={(e) => set('workAuthorization.workPermitExpiry', e.target.value)} placeholder="YYYY-MM-DD" /></Field>
      </Section>

      <Section title="Compensation">
        <Field label="Salary expectation" hint="A number, not text — forms reject '1 million'."><Input value={p.compensation.salaryExpectation} onChange={(e) => set('compensation.salaryExpectation', e.target.value)} /></Field>
        <Field label="Currency"><Select value={p.compensation.currency} options={currencyOptions} onChange={(e) => set('compensation.currency', e.target.value)} /></Field>
        <Field label="Range min"><Input value={p.compensation.salaryMin} onChange={(e) => set('compensation.salaryMin', e.target.value)} /></Field>
        <Field label="Range max"><Input value={p.compensation.salaryMax} onChange={(e) => set('compensation.salaryMax', e.target.value)} /></Field>
        <Field label="Current base pay"><Input value={p.compensation.currentBase} onChange={(e) => set('compensation.currentBase', e.target.value)} /></Field>
        <Field label="Current total compensation"><Input value={p.compensation.currentTotal} onChange={(e) => set('compensation.currentTotal', e.target.value)} /></Field>
        <Field label="Current-pay currency"><Select value={p.compensation.currentCurrency} options={currencyOptions} onChange={(e) => set('compensation.currentCurrency', e.target.value)} /></Field>
        <Field label="Expected base pay"><Input value={p.compensation.expectedBase} onChange={(e) => set('compensation.expectedBase', e.target.value)} /></Field>
        <Field label="Expected total compensation"><Input value={p.compensation.expectedTotal} onChange={(e) => set('compensation.expectedTotal', e.target.value)} /></Field>
        <Field label="Expected-pay currency"><Select value={p.compensation.expectedCurrency} options={currencyOptions} onChange={(e) => set('compensation.expectedCurrency', e.target.value)} /></Field>
        <Field label="Pay period"><Select value={p.compensation.payPeriod} options={payPeriodOptions} onChange={(e) => set('compensation.payPeriod', e.target.value)} /></Field>
        <Field label="Bonus expectation"><Input value={p.compensation.bonus} onChange={(e) => set('compensation.bonus', e.target.value)} /></Field>
        <Field label="Equity expectation"><Input value={p.compensation.equity} onChange={(e) => set('compensation.equity', e.target.value)} /></Field>
        <Field label="Compensation negotiable"><Select value={p.compensation.negotiable} options={yesNoOptions} onChange={(e) => set('compensation.negotiable', e.target.value)} /></Field>
        <Field label="Compensation note"><Input value={p.compensation.note} onChange={(e) => set('compensation.note', e.target.value)} /></Field>
      </Section>

      <Section title="Experience">
        <Field label="Years total"><Input value={p.experience.yearsTotal} onChange={(e) => set('experience.yearsTotal', e.target.value)} /></Field>
        <Field label="Education level"><Select value={p.experience.educationLevel} options={educationOptions} onChange={(e) => set('experience.educationLevel', e.target.value)} /></Field>
        <Field label="Current title"><Input value={p.experience.currentTitle} onChange={(e) => set('experience.currentTitle', e.target.value)} /></Field>
        <Field label="Current company"><Input value={p.experience.currentCompany} onChange={(e) => set('experience.currentCompany', e.target.value)} /></Field>
        <Field label="Target role"><Input value={p.experience.targetRole} onChange={(e) => set('experience.targetRole', e.target.value)} /></Field>
      </Section>

      <Section title="Application preferences">
        <Field label="Comfortable with a fully onsite schedule"><Select value={p.applicationPreferences.comfortableFullyOnsite} options={yesNoOptions} onChange={(e) => set('applicationPreferences.comfortableFullyOnsite', e.target.value)} /></Field>
        <Field label="Willing to relocate"><Select value={p.applicationPreferences.willingToRelocate} options={yesNoOptions} onChange={(e) => set('applicationPreferences.willingToRelocate', e.target.value)} /></Field>
        <Field label="Open to remote"><Select value={p.applicationPreferences.openToRemote} options={yesNoOptions} onChange={(e) => set('applicationPreferences.openToRemote', e.target.value)} /></Field>
        <Field label="Open to hybrid"><Select value={p.applicationPreferences.openToHybrid} options={yesNoOptions} onChange={(e) => set('applicationPreferences.openToHybrid', e.target.value)} /></Field>
        <Field label="Open to onsite"><Select value={p.applicationPreferences.openToOnsite} options={yesNoOptions} onChange={(e) => set('applicationPreferences.openToOnsite', e.target.value)} /></Field>
        <Field label="Open to US remote roles"><Select value={p.applicationPreferences.openToUSRemote} options={yesNoOptions} onChange={(e) => set('applicationPreferences.openToUSRemote', e.target.value)} /></Field>
        <Field label="Open to US contract roles"><Select value={p.applicationPreferences.openToUSContract} options={yesNoOptions} onChange={(e) => set('applicationPreferences.openToUSContract', e.target.value)} /></Field>
        <Field label="Open to international contract roles"><Select value={p.applicationPreferences.openToInternationalContract} options={yesNoOptions} onChange={(e) => set('applicationPreferences.openToInternationalContract', e.target.value)} /></Field>
        <Field label="Preferred work modes"><Input value={csv(p.applicationPreferences.preferredWorkModes)} onChange={(e) => set('applicationPreferences.preferredWorkModes', toArr(e.target.value))} placeholder="Remote, Hybrid" /></Field>
        <Field label="Employment types"><Input value={csv(p.applicationPreferences.employmentTypes)} onChange={(e) => set('applicationPreferences.employmentTypes', toArr(e.target.value))} placeholder="Full-time, Contract" /></Field>
        <Field label="Target countries"><Input value={csv(p.applicationPreferences.targetCountries)} onChange={(e) => set('applicationPreferences.targetCountries', toArr(e.target.value))} /></Field>
        <Field label="Preferred time zones"><Input value={csv(p.applicationPreferences.preferredTimeZones)} onChange={(e) => set('applicationPreferences.preferredTimeZones', toArr(e.target.value))} /></Field>
        <Field label="Willing to travel"><Select value={p.applicationPreferences.willingToTravel} options={yesNoOptions} onChange={(e) => set('applicationPreferences.willingToTravel', e.target.value)} /></Field>
        <Field label="Maximum travel"><Input value={p.applicationPreferences.maxTravelPercent} onChange={(e) => set('applicationPreferences.maxTravelPercent', e.target.value)} placeholder="25%" /></Field>
        <Field label="Notice period"><Input value={p.applicationPreferences.noticePeriod} onChange={(e) => set('applicationPreferences.noticePeriod', e.target.value)} /></Field>
        <Field label="Available start date"><Input value={p.applicationPreferences.availableStartDate} onChange={(e) => set('applicationPreferences.availableStartDate', e.target.value)} placeholder="YYYY-MM-DD" /></Field>
      </Section>

      <Section title="Screening facts">
        <Field label="Restrictive covenant"><Select value={p.screening.restrictiveCovenant} options={yesNoOptions} onChange={(e) => set('screening.restrictiveCovenant', e.target.value)} /></Field>
        <Field label="Currently employed by a brand partner"><Select value={p.screening.currentBrandPartner} options={yesNoOptions} onChange={(e) => set('screening.currentBrandPartner', e.target.value)} /></Field>
        <Field label="Deployed AI to production"><Select value={p.screening.deployedAiToProduction} options={yesNoOptions} onChange={(e) => set('screening.deployedAiToProduction', e.target.value)} /></Field>
        <Field label="Previously employed by"><Input value={csv(p.screening.previouslyEmployedByCompanies)} onChange={(e) => set('screening.previouslyEmployedByCompanies', toArr(e.target.value))} placeholder="Company names" /></Field>
        <Field label="Security clearance"><Input value={p.screening.securityClearance} onChange={(e) => set('screening.securityClearance', e.target.value)} /></Field>
        <Field label="Conflict of interest"><Select value={p.screening.conflictOfInterest} options={yesNoOptions} onChange={(e) => set('screening.conflictOfInterest', e.target.value)} /></Field>
        <Field label="Background-check consent"><Select value={p.screening.backgroundCheckConsent} options={yesNoOptions} onChange={(e) => set('screening.backgroundCheckConsent', e.target.value)} /></Field>
        <Field label="Drug-test consent"><Select value={p.screening.drugTestConsent} options={yesNoOptions} onChange={(e) => set('screening.drugTestConsent', e.target.value)} /></Field>
        <Field label="Referral source"><Input value={p.screening.referralSource} onChange={(e) => set('screening.referralSource', e.target.value)} /></Field>
        <Field label="Criminal-history note"><Input value={p.screening.criminalHistoryNote} onChange={(e) => set('screening.criminalHistoryNote', e.target.value)} /></Field>
      </Section>

      <Section title="Technical answer bank" cols={1}>
        <Field label="Professional summary"><Textarea rows={4} value={p.narratives.professionalSummary} onChange={(e) => set('narratives.professionalSummary', e.target.value)} /></Field>
        <Field label="Technical highlights"><Textarea rows={4} value={p.narratives.technicalHighlights} onChange={(e) => set('narratives.technicalHighlights', e.target.value)} /></Field>
        <Field label="AI production example"><Textarea rows={5} value={p.narratives.aiProductionExample} onChange={(e) => set('narratives.aiProductionExample', e.target.value)} /></Field>
        <Field label="Public-work description"><Textarea rows={5} value={p.narratives.publicWorkDescription} onChange={(e) => set('narratives.publicWorkDescription', e.target.value)} /></Field>
        <Field label="Leadership summary"><Textarea rows={4} value={p.narratives.leadershipSummary} onChange={(e) => set('narratives.leadershipSummary', e.target.value)} /></Field>
        <Field label="Role motivation"><Textarea rows={4} value={p.narratives.motivation} onChange={(e) => set('narratives.motivation', e.target.value)} /></Field>
        <Field label="Cover-letter notes"><Textarea rows={4} value={p.narratives.coverLetterNotes} onChange={(e) => set('narratives.coverLetterNotes', e.target.value)} /></Field>
      </Section>

      <Section title="Skills" cols={1}>
        <Field label="Languages"><Input value={csv(p.skills.languages)} onChange={(e) => set('skills.languages', toArr(e.target.value))} /></Field>
        <Field label="Frameworks"><Input value={csv(p.skills.frameworks)} onChange={(e) => set('skills.frameworks', toArr(e.target.value))} /></Field>
        <Field label="DevOps / Cloud"><Input value={csv(p.skills.devops)} onChange={(e) => set('skills.devops', toArr(e.target.value))} /></Field>
        <Field label="Databases"><Input value={csv(p.skills.databases)} onChange={(e) => set('skills.databases', toArr(e.target.value))} /></Field>
        <Field label="Tools"><Input value={csv(p.skills.tools)} onChange={(e) => set('skills.tools', toArr(e.target.value))} /></Field>
      </Section>

      <Section title="Resume detail bank" cols={1}>
        <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">One item per line. SAGE extracts these from the résumé and includes them in every technical and screening-answer context.</p>
        <Field label="Education history"><Textarea rows={4} value={lines(p.resumeFacts.education)} onChange={(e) => set('resumeFacts.education', toLines(e.target.value))} placeholder="Degree, field, institution, dates, GPA or honors when stated" /></Field>
        <Field label="Projects"><Textarea rows={4} value={lines(p.resumeFacts.projects)} onChange={(e) => set('resumeFacts.projects', toLines(e.target.value))} /></Field>
        <Field label="Certifications"><Textarea rows={3} value={lines(p.resumeFacts.certifications)} onChange={(e) => set('resumeFacts.certifications', toLines(e.target.value))} /></Field>
        <Field label="Awards"><Textarea rows={3} value={lines(p.resumeFacts.awards)} onChange={(e) => set('resumeFacts.awards', toLines(e.target.value))} /></Field>
        <Field label="Publications"><Textarea rows={3} value={lines(p.resumeFacts.publications)} onChange={(e) => set('resumeFacts.publications', toLines(e.target.value))} /></Field>
        <Field label="Patents"><Textarea rows={3} value={lines(p.resumeFacts.patents)} onChange={(e) => set('resumeFacts.patents', toLines(e.target.value))} /></Field>
        <Field label="Spoken languages"><Input value={csv(p.resumeFacts.spokenLanguages)} onChange={(e) => set('resumeFacts.spokenLanguages', toArr(e.target.value))} /></Field>
        <Field label="Professional memberships"><Textarea rows={3} value={lines(p.resumeFacts.professionalMemberships)} onChange={(e) => set('resumeFacts.professionalMemberships', toLines(e.target.value))} /></Field>
        <Field label="Quantified outcomes"><Textarea rows={4} value={lines(p.resumeFacts.metrics)} onChange={(e) => set('resumeFacts.metrics', toLines(e.target.value))} /></Field>
      </Section>

      <Section title="EEO (voluntary)">
        <Field label="Gender"><Select value={p.eeo.gender} options={genderOptions} onChange={(e) => set('eeo.gender', e.target.value)} /></Field>
        <Field label="Pronouns"><Select value={p.eeo.pronouns} options={pronounOptions} onChange={(e) => set('eeo.pronouns', e.target.value)} /></Field>
        <Field label="Hispanic / Latino"><Select value={p.eeo.hispanicLatino} options={yesNoDeclineOptions} onChange={(e) => set('eeo.hispanicLatino', e.target.value)} /></Field>
        <Field label="Race / ethnicity"><Select value={p.eeo.raceEthnicity} options={raceEthnicityOptions} onChange={(e) => set('eeo.raceEthnicity', e.target.value)} /></Field>
        <Field label="Veteran status"><Select value={p.eeo.veteranStatus} options={veteranOptions} onChange={(e) => set('eeo.veteranStatus', e.target.value)} /></Field>
        <Field label="Disability status"><Select value={p.eeo.disabilityStatus} options={disabilityOptions} onChange={(e) => set('eeo.disabilityStatus', e.target.value)} /></Field>
      </Section>

      <div className="h-8" />
      </div>
    </div>
  )
}

function Section({ title, children, cols = 2 }: { title: string; children: React.ReactNode; cols?: 1 | 2 }) {
  return (
    <Card className="mb-4 p-5">
      <h2 className="mb-4 text-sm font-bold text-foreground">{title}</h2>
      <div className={`grid gap-4 ${cols === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>{children}</div>
    </Card>
  )
}
