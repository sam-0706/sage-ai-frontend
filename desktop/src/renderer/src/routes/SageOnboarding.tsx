import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Briefcase, Check, GraduationCap, Layers, MessageCircle, PhoneCall, Rocket, Send } from 'lucide-react'
import { api, errorMessage, type Mode } from '@/sage/api'
import { useSage } from '@/sage/state'
import { Button, Card, Field, Input, Select, Spinner, Switch, Textarea } from '@/components/ui'
import { Brand } from '@/components/Brand'
import catalogue from '@shared/bitsom-catalogue.json'
import { cn } from '@/lib/utils'

type FieldKind = 'text' | 'number' | 'tags' | 'select' | 'long'
interface FieldDef { key: string; label: string; kind: FieldKind; placeholder?: string; options?: string[]; required?: boolean }

const FIELDS: Record<Mode, FieldDef[]> = {
  student: [
    { key: 'institution_name', label: 'College / university', kind: 'text', placeholder: 'e.g. BITS School of Management' },
    { key: 'program', label: 'Programme', kind: 'select', options: ['MBA'], required: true },
    { key: 'semester', label: 'Term', kind: 'select', options: ['1','2','3','4','5','6'], required: true },
    { key: 'specialisation', label: 'Specialisation', kind: 'select', options: ['Entrepreneurship and Innovation','Finance and Investing','Ecommerce and Digital Leadership','Leadership and Strategy','Marketing and Consumer Insights','Operations and Supply Chain Management'], required: true },
    { key: 'batch', label: 'Batch / graduating year', kind: 'number', required: true },
    { key: 'section', label: 'Section', kind: 'text' },
    { key: 'target_role', label: 'Dream role', kind: 'text', required: true },
    { key: 'salary_lpa', label: 'Target annual salary (INR lakh)', kind: 'number', required: true },
    { key: 'daily_minutes', label: 'Minutes available each day (10–480)', kind: 'number', required: true },
    { key: 'skills', label: 'Current skills', kind: 'tags' },
    { key: 'preferred_locations', label: 'Preferred job locations', kind: 'tags' },
    { key: 'experience_summary', label: 'Projects, work experience and achievements', kind: 'long' },
    { key: 'internships_completed', label: 'Internships completed', kind: 'number' },
    { key: 'resume_summary', label: 'Resume facts for career planning', kind: 'long' },
    { key: 'subjects', label: 'Subjects this term (one per line)', kind: 'tags', placeholder: 'Comma separated', required: true },
    { key: 'career_goal', label: 'Career goal', kind: 'text', placeholder: 'e.g. Product management internship', required: true },
    { key: 'availability', label: 'When do you usually study?', kind: 'text', placeholder: 'e.g. Weekday evenings' }
  ],
  professional: [
    { key: 'current_role', label: 'Current role', kind: 'text', placeholder: 'e.g. Data analyst' },
    { key: 'target_role', label: 'Target role', kind: 'text', placeholder: 'e.g. Associate Product Manager', required: true },
    { key: 'skill_goals', label: 'Skills to build', kind: 'tags', placeholder: 'Comma separated', required: true },
    { key: 'courses', label: 'Courses / certifications', kind: 'tags', placeholder: 'Comma separated' },
    { key: 'weekly_availability_hours', label: 'Learning hours per week', kind: 'number', placeholder: '6', required: true },
    { key: 'interview_dates', label: 'Upcoming interviews', kind: 'text', placeholder: 'e.g. APM loop on 15 Oct' },
    { key: 'portfolio_gaps', label: 'Portfolio gaps', kind: 'tags', placeholder: 'Comma separated' }
  ],
  founder: [
    { key: 'venture_name', label: 'Venture name', kind: 'text' },
    { key: 'venture_stage', label: 'Stage', kind: 'select', options: ['idea', 'pre-seed', 'seed', 'series A+', 'bootstrapped'], required: true },
    { key: 'current_milestone', label: 'Current milestone', kind: 'text', placeholder: 'e.g. 10 paying pilot customers', required: true },
    { key: 'customer_questions', label: 'Open customer questions', kind: 'tags', placeholder: 'Comma separated' },
    { key: 'experiments', label: 'Running experiments', kind: 'tags', placeholder: 'Comma separated' },
    { key: 'important_dates', label: 'Important dates', kind: 'text', placeholder: 'e.g. Accelerator pitch on 20 Oct' },
    { key: 'decisions', label: 'Decisions to make', kind: 'tags', placeholder: 'Comma separated' }
  ]
}

const MODES: { value: Mode; title: string; blurb: string; icon: React.ReactNode }[] = [
  { value: 'student', title: 'Student', blurb: 'Stay on track academically, prepare for exams and get placement-ready.', icon: <GraduationCap className="h-5 w-5" /> },
  { value: 'professional', title: 'Working professional', blurb: 'Upskill, change roles and protect learning time around work.', icon: <Briefcase className="h-5 w-5" /> },
  { value: 'founder', title: 'Founder', blurb: 'Turn learning gaps and priorities into accountable weekly actions.', icon: <Rocket className="h-5 w-5" /> }
]

const INTERESTS = [
  { value: 'exam_prep', label: 'Exam prep & cue cards', hint: 'AI flashcards and spoken quizzes', icon: <Layers className="h-4 w-4" /> },
  { value: 'check_ins', label: 'AI check-in calls', hint: 'A short call that turns blockers into a plan', icon: <PhoneCall className="h-4 w-4" /> },
  { value: 'auto_apply', label: 'Auto-apply to jobs', hint: 'Desktop agent fills applications for you', icon: <Send className="h-4 w-4" /> },
  { value: 'ask_sage', label: 'Ask SAGE', hint: 'Answers about policies, deadlines and whom to ask', icon: <MessageCircle className="h-4 w-4" /> }
]

const CALL_WINDOWS = ['Weekday mornings', 'Weekday afternoons', 'Weekday evenings', 'Weekends', 'Any time']
const STEPS = ['You', 'Your context', 'Goals', 'Calls', 'Review']

interface Prefill {
  full_name: string | null
  email: string
  phone: string | null
  mode: Mode
  waitlist_segment: string | null
  institution: string | null
  profile: Record<string, unknown>
  goals: string[]
  deadline_call_consent: boolean
  call_consent: boolean
}

export function SageOnboarding() {
  const { refreshMe } = useSage()
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [segment, setSegment] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<Mode>('student')
  const [profile, setProfile] = useState<Record<string, string>>({})
  const [interests, setInterests] = useState<string[]>(['exam_prep', 'check_ins'])
  const [goals, setGoals] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [deadlineConsent, setDeadlineConsent] = useState(false)
  const [window_, setWindow] = useState('Weekday evenings')

  useEffect(() => {
    void api.get<{ prefill: Prefill }>('/v1/onboarding').then(({ prefill }) => {
      setEmail(prefill.email)
      setSegment(prefill.waitlist_segment)
      setName(prefill.full_name ?? '')
      setMode(prefill.mode)
      setPhone(prefill.phone ?? '')
      setConsent(prefill.call_consent)
      setDeadlineConsent(prefill.deadline_call_consent ?? false)
      setGoals(prefill.goals.join('\n'))
      const p: Record<string, string> = {}
      for (const [k, v] of Object.entries(prefill.profile)) p[k] = Array.isArray(v) ? v.join(k === 'subjects' ? '\n' : ', ') : v == null ? '' : String(v)
      if (prefill.institution && !p.institution_name) p.institution_name = prefill.institution
      setProfile({institution_name:'BITSoM, Mumbai',program:'MBA',semester:'1',batch:'2026',daily_minutes:'60',...p})
      if (prefill.mode === 'professional' || prefill.mode === 'founder') setInterests(['check_ins', 'auto_apply'])
    }).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false))
  }, [])

  const fields = FIELDS[mode]
  const missing = useMemo(() => fields.filter((f) => f.required && !profile[f.key]?.trim()).map((f) => f.label), [fields, profile])
  const canNext = step === 0 ? name.trim().length > 0 : step === 1 ? missing.length === 0 : step === 3 ? !(consent || deadlineConsent) || /^\+[1-9]\d{7,14}$/.test(phone.replace(/[\s()-]/g,'')) : true

  const toPayload = () => {
    const out: Record<string, unknown> = {}
    for (const f of fields) {
      const v = profile[f.key]?.trim()
      if (!v) continue
      out[f.key] = f.kind === 'tags' ? v.split(f.key === 'subjects' ? '\n' : ',').map((s) => s.trim()).filter(Boolean) : f.kind === 'number' ? Number(v) : v
    }
    if (mode === 'student') out.onboarding_version = 2
    return out
  }

  const finish = async () => {
    setSaving(true)
    setError('')
    try {
      await api.post('/v1/onboarding', {
        full_name: name.trim(), mode, phone: phone.trim() || null, profile: toPayload(),
        goals: goals.split('\n').map((g) => g.trim()).filter(Boolean).slice(0, 10), interests,
        call_consent: consent, deadline_call_consent: deadlineConsent, preferred_call_window: consent ? window_ : null
      })
      await refreshMe()
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Spinner className="h-5 w-5 text-primary" /></div>

  return (
    <div className="flex h-full flex-col">
      <div className="drag flex items-center justify-between px-8 pb-2 pt-9">
        <div className="no-drag"><Brand /></div>
        <span className="mono text-[11px] text-muted-foreground">{email}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
        <div className="mx-auto max-w-2xl">
          <ol className="mb-8 mt-6 flex items-center gap-2" aria-label="Onboarding progress">
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-1 items-center gap-2">
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  i < step ? 'bg-primary text-primary-foreground' : i === step ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground')}>
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={cn('hidden text-xs font-semibold sm:block', i === step ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
                {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
              </li>
            ))}
          </ol>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} initial={{ opacity: 0, y: reduce ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}>
              {step === 0 && (
                <section className="space-y-6">
                  <header>
                    <h1 className="text-3xl font-bold">Welcome{name ? `, ${name.split(' ')[0]}` : ''} 👋</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                      You're one of our waitlisted testers{segment ? ` · ${segment}` : ''}. We pre-filled what we already know — just confirm it.
                    </p>
                  </header>
                  <Field label="Your name"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-muted-foreground">How will you use SAGE?</span>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {MODES.map((m) => (
                        <button key={m.value} type="button" onClick={() => setMode(m.value)} aria-pressed={mode === m.value}
                          className={cn('rounded-[var(--radius-card)] p-4 text-left transition-colors no-drag',
                            mode === m.value ? 'bg-primary/12 shadow-[inset_0_0_0_2px_oklch(var(--primary))]' : 'bg-card shadow-[inset_0_0_0_1px_oklch(var(--border))] hover:bg-secondary')}>
                          <span className={cn('flex h-9 w-9 items-center justify-center rounded-full', mode === m.value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')}>{m.icon}</span>
                          <span className="mt-3 block text-sm font-bold">{m.title}</span>
                          <span className="mt-1 block whitespace-normal text-xs leading-relaxed text-muted-foreground">{m.blurb}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {step === 1 && (
                <section className="space-y-6">
                  <header>
                    <h1 className="text-3xl font-bold">Your context</h1>
                    <p className="mt-2 text-sm text-muted-foreground">SAGE uses this to pick your priorities. Missing details lower confidence — they are never guessed.</p>
                  </header>
                  <Card className="grid gap-4 p-5 sm:grid-cols-2">
                    {fields.map((f) => (
                      <div key={f.key} className={cn(f.kind === 'tags' || f.kind === 'long' ? 'sm:col-span-2' : '')}>
                        <Field label={`${f.label}${f.required ? ' *' : ''}`}>
                          {f.kind === 'long' || f.key === 'subjects' ? <Textarea rows={4} value={profile[f.key] ?? ''} onChange={e=>setProfile({...profile,[f.key]:e.target.value})} /> : f.kind === 'select' ? (
                            <Select value={profile[f.key] ?? ''} onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })}
                              options={[{ value: '', label: 'Choose…' }, ...(f.options ?? [])]} />
                          ) : (
                            <Input type={f.kind === 'number' ? 'number' : 'text'} min={0} placeholder={f.placeholder}
                              value={profile[f.key] ?? ''} onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })} />
                          )}
                        </Field>
                      </div>
                    ))}
                  </Card>
                  {mode === 'student' && <Card className="space-y-3 p-5"><h3 className="font-bold">Choose courses from the published BITSoM catalogue</h3><p className="text-xs text-muted-foreground">All published core, elective and workplace course entries. Current availability needs institute confirmation.</p><div className="max-h-64 overflow-auto space-y-2">{Array.from(new Set(catalogue.tables.flatMap(table => table.slice(1).flatMap(row => row.slice(row.length === 3 ? 1 : 0))).filter(Boolean))).map(title => { const chosen=(profile.subjects ?? '').split('\n').map(x=>x.trim()); return <label className="flex gap-2 text-sm" key={title}><input type="checkbox" checked={chosen.includes(title)} onChange={e=>setProfile({...profile,subjects:(e.target.checked ? [...chosen.filter(Boolean),title] : chosen.filter(x=>x!==title)).join('\n')})} />{title}</label> })}</div><Button variant="outline" onClick={async()=>{const imported=await window.auta.getProfile(); if(imported) setProfile({...profile,resume_summary:JSON.stringify(imported,null,2).slice(0,16000)});}}>Use imported AutA profile for resume context</Button></Card>}
                  {missing.length > 0 && <p className="text-xs text-muted-foreground">Still needed: {missing.join(', ')}</p>}
                </section>
              )}

              {step === 2 && (
                <section className="space-y-6">
                  <header>
                    <h1 className="text-3xl font-bold">What do you want from SAGE?</h1>
                    <p className="mt-2 text-sm text-muted-foreground">Pick everything that helps. Access depends on your chosen plan.</p>
                  </header>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {INTERESTS.map((it) => {
                      const on = interests.includes(it.value)
                      return (
                        <button key={it.value} type="button" aria-pressed={on}
                          onClick={() => setInterests(on ? interests.filter((x) => x !== it.value) : [...interests, it.value])}
                          className={cn('flex items-start gap-3 rounded-[var(--radius-card)] p-4 text-left transition-colors no-drag',
                            on ? 'bg-primary/12 shadow-[inset_0_0_0_2px_oklch(var(--primary))]' : 'bg-card shadow-[inset_0_0_0_1px_oklch(var(--border))] hover:bg-secondary')}>
                          <span className={cn('mt-0.5', on ? 'text-primary' : 'text-muted-foreground')}>{it.icon}</span>
                          <span className="min-w-0">
                            <span className="block text-sm font-bold">{it.label}</span>
                            <span className="block whitespace-normal text-xs text-muted-foreground">{it.hint}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <Field label="Your top goals this term (one per line)" hint="e.g. Clear Business Statistics with 70%+ · Land a PM internship">
                    <Textarea rows={4} value={goals} onChange={(e) => setGoals(e.target.value)} />
                  </Field>
                </section>
              )}

              {step === 3 && (
                <section className="space-y-6">
                  <header>
                    <h1 className="text-3xl font-bold">AI calls</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                      SAGE can call you for a short check-in or a spoken exam quiz. Study and interview calls start when you confirm. Automatic overdue follow-ups require the separate opt-in below.
                    </p>
                  </header>
                  <Card className="space-y-5 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-bold">Allow SAGE to call me when I start a call</div>
                        <div className="text-xs text-muted-foreground">Calls go only to your own number. No one else is ever contacted.</div>
                      </div>
                      <Switch checked={consent} onChange={setConsent} label="Allow AI calls" />
                    </div>
                    <div className="flex items-center justify-between gap-4"><div><div className="text-sm font-bold">Automatic overdue assignment and fee follow-ups</div><p className="text-xs text-muted-foreground">Opt in to AI calls to your number, 9 am–6 pm IST, at most once per day. Pro / Ultra. Change this preference in onboarding at any time.</p></div><Switch checked={deadlineConsent} onChange={setDeadlineConsent} label="Allow automatic deadline calls" /></div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Phone number (with country code)"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" /></Field>
                      <Field label="Best time to call"><Select value={window_} onChange={(e) => setWindow(e.target.value)} options={CALL_WINDOWS} disabled={!consent} /></Field>
                    </div>
                  </Card>
                </section>
              )}

              {step === 4 && (
                <section className="space-y-6">
                  <header>
                    <h1 className="text-3xl font-bold">All set?</h1>
                    <p className="mt-2 text-sm text-muted-foreground">You can change any of this later in Settings.</p>
                  </header>
                  <Card className="divide-y divide-border p-0 text-sm">
                    <Row k="Name" v={name} />
                    <Row k="Using SAGE as" v={MODES.find((m) => m.value === mode)?.title ?? mode} />
                    {fields.filter((f) => profile[f.key]).map((f) => <Row key={f.key} k={f.label} v={profile[f.key]} />)}
                    <Row k="Interested in" v={interests.map((i) => INTERESTS.find((x) => x.value === i)?.label).join(' · ') || '—'} />
                    <Row k="Automatic overdue calls" v={deadlineConsent ? "Opted in · 9 am–6 pm IST · at most daily" : "Off"} />
                    <Row k="AI calls" v={consent ? `Yes — ${phone} · ${window_}` : 'Not now'} />
                  </Card>
                </section>
              )}
            </motion.div>
          </AnimatePresence>

          {error && <p className="mt-4 rounded-[var(--radius-input)] bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}><ArrowLeft className="h-4 w-4" /> Back</Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext}>Continue <ArrowRight className="h-4 w-4" /></Button>
            ) : (
              <Button onClick={finish} loading={saving}>Finish setup <Check className="h-4 w-4" /></Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 px-5 py-3">
      <span className="w-40 shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 whitespace-normal font-semibold">{v}</span>
    </div>
  )
}
