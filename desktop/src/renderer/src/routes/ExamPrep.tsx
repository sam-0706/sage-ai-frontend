import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft, Brain, CalendarClock, CheckCircle2, CircleAlert, Flame, Layers, Lightbulb, ListChecks,
  PhoneCall, Plus, RotateCcw, Sparkles, Target, Trash2, TriangleAlert, XCircle
} from 'lucide-react'
import {
  api, errorMessage, READINESS_LABEL, READINESS_TONE, type Assessment, type Card as CueCard, type CallState, type Deck,
  type DeckSummary
} from '@/sage/api'
import { useSage } from '@/sage/state'
import { Badge, Button, Card, Field, Input, Progress, Select, Spinner, Textarea } from '@/components/ui'
import { courses } from '@shared/academics'
import catalogue from '@shared/bitsom-catalogue.json'
import { CallPanel } from '@/components/CallPanel'
import { cn, timeAgo } from '@/lib/utils'

type View = { name: 'home' } | { name: 'deck'; id: string; tab?: DeckTab } | { name: 'assessment'; id: string; deckId?: string }
type DeckTab = 'study' | 'cards' | 'quiz' | 'results'

interface Overview {
  decks: number
  due_now: number
  reviewed_today: number
  assessments: number
  streak_days: number
  recent_assessments: { id: string; overall_score: number; readiness: Assessment['readiness']; created_at: string; deck_title: string; deck_id: string }[]
}

export function ExamPrep({voice=false}:{voice?:boolean}) {
  const [view, setView] = useState<View>({ name: 'home' })
  return view.name === 'home' ? <ExamHome voice={voice} open={setView} />
    : view.name === 'deck' ? <DeckView id={view.id} initialTab={view.tab} open={setView} />
      : <AssessmentPage id={view.id} back={() => setView(view.deckId ? { name: 'deck', id: view.deckId, tab: 'results' } : { name: 'home' })} open={setView} />
}

// ================================================================= home: overview + generate + decks
function ExamHome({ open,voice }: { open: (v: View) => void; voice:boolean }) {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [decks, setDecks] = useState<DeckSummary[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [o, d] = await Promise.all([api.get<Overview>('/v1/exam-prep/overview'), api.get<{ items: DeckSummary[] }>('/v1/exam-prep/decks')])
      setOverview(o)
      setDecks(d.items)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <Page title={voice ? "Study AI" : "Quick Notes"} subtitle="Learn a topic fast with AI cue cards, then take a spoken quiz to see exactly where you stand.">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat icon={<Layers className="h-4 w-4" />} label="Decks" value={overview?.decks} />
        <Stat icon={<CalendarClock className="h-4 w-4" />} label="Cards due now" value={overview?.due_now} accent={!!overview?.due_now} />
        <Stat icon={<Flame className="h-4 w-4" />} label="Study streak" value={overview ? `${overview.streak_days} day${overview.streak_days === 1 ? '' : 's'}` : undefined} />
        <Stat icon={<Target className="h-4 w-4" />} label="Last quiz" value={overview?.recent_assessments[0] ? `${overview.recent_assessments[0].overall_score}%` : '—'} />
      </div>

      <GenerateDeck onCreated={(d) => open({ name: 'deck', id: d.id, tab: voice ? 'quiz' : 'cards' })} />

      {error && <p className="text-sm text-destructive">{error}</p>}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Your decks</h2>
        {decks === null ? <Spinner className="text-primary" /> : decks.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No decks yet. Type a topic above — your first deck takes about 20 seconds.</Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {decks.map((d) => (
              <button key={d.id} onClick={() => open({ name: 'deck', id: d.id, tab: voice ? 'quiz' : 'cards' })} className="text-left no-drag">
                <Card className="h-full space-y-3 p-5 transition-colors hover:bg-secondary/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-bold">{d.title}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{[d.level, d.exam].filter(Boolean).join(' · ') || d.topic}</div>
                    </div>
                    {d.last_readiness && <Badge tone={READINESS_TONE[d.last_readiness]}>{d.last_score}% · {READINESS_LABEL[d.last_readiness]}</Badge>}
                  </div>
                  <Progress value={d.card_count ? d.learned / d.card_count : 0} />
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{d.card_count} cards</span><span>{d.learned} learned</span>
                    <span className={cn(d.due_now > 0 && 'font-semibold text-primary')}>{d.due_now} due</span>
                    <span className="ml-auto">{timeAgo(d.updated_at)}</span>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </section>
    </Page>
  )
}

function GenerateDeck({ onCreated }: { onCreated: (d: Deck) => void }) {
  const { me } = useSage()
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState('MBA')
  const [subject,setSubject] = useState(courses[0].name)
  const [exam, setExam] = useState('')
  const [count, setCount] = useState('12')
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      onCreated(await api.post<Deck>('/v1/exam-prep/decks', {
        topic: (subject === 'Custom' ? topic.trim() : subject + ': ' + topic.trim()).slice(0,200), level: level.trim() || null, exam: exam.trim() || null, count: Number(count), notes: showNotes && notes.trim() ? notes : null
      }))
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  const left = me?.subscription?.ai_requests.remaining
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold"><Sparkles className="h-4 w-4 text-primary" /> Make cue cards for a topic</h2>
        {left !== undefined && <span className="text-[11px] text-muted-foreground">{left} AI generations left</span>}
      </div>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_110px]">
        <Field label="Course"><Select value={subject} onChange={e=>setSubject(e.target.value)} options={[...Array.from(new Set(catalogue.tables.flatMap(table=>table.slice(1).flatMap(row=>row.slice(row.length===3?1:0))).filter(Boolean))),'Custom']} /></Field>
        <Field label="Suggested question focus"><Select value="" onChange={e=>setTopic(e.target.value)} options={[{value:'',label:'Choose a focus or type below'},...(courses.find(c=>c.name===subject)?.cards??[]).map(c=>({value:c.question,label:c.question}))]} /></Field>
        <Field label="Topic"><Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Hypothesis testing, market segmentation, valuation" onKeyDown={(e) => e.key === 'Enter' && topic.trim().length > 1 && !busy && void create()} /></Field>
        <Field label="Level (optional)"><Input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="e.g. BBA year 2" /></Field>
        <Field label="Exam (optional)"><Input value={exam} onChange={(e) => setExam(e.target.value)} placeholder="e.g. End-term" /></Field>
        <Field label="Cards"><Select value={count} onChange={(e) => setCount(e.target.value)} options={['8', '12', '16', '20', '30']} /></Field>
      </div>
      {showNotes && (
        <Field label="Your notes or syllabus" hint="Cards will be based only on this text.">
          <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste lecture notes, a syllabus section or a chapter summary…" />
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={create} loading={busy} disabled={topic.trim().length < 2}><Sparkles className="h-4 w-4" /> Generate deck</Button>
        <Button variant="ghost" size="sm" onClick={() => setShowNotes(!showNotes)}>{showNotes ? 'Remove notes' : 'Use my notes'}</Button>
        {busy && <span className="flex items-center gap-2 text-xs text-muted-foreground"><Spinner className="text-primary" /> Writing your cards — about 20 seconds…</span>}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </Card>
  )
}

// ================================================================= deck
export function DeckView({ id, initialTab, open }: { id: string; initialTab?: DeckTab; open: (v: View) => void }) {
  const { me } = useSage()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [tab, setTab] = useState<DeckTab>(initialTab ?? 'cards')
  const [notesOpen, setNotesOpen] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try { setDeck(await api.get<Deck>(`/v1/exam-prep/decks/${id}`)) } catch (e) { setError(errorMessage(e)) }
  }, [id])
  useEffect(() => { void load() }, [load])

  const remove = async () => {
    if (!confirm('Delete this deck and its review history?')) return
    await api.del(`/v1/exam-prep/decks/${id}`)
    open({ name: 'home' })
  }

  if (!deck) return <Page title="Loading…" back={() => open({ name: 'home' })}>{error ? <p className="text-destructive">{error}</p> : <Spinner className="text-primary" />}</Page>

  const tabs: { id: DeckTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'study', label: 'Quiz · practice', icon: <Brain className="h-4 w-4" />, badge: deck.stats.due_now || undefined },
    { id: 'cards', label: 'All cards', icon: <Layers className="h-4 w-4" /> },
    { id: 'quiz', label: deck.coach_kind === 'interview' ? 'Mock interview' : 'Study AI call', icon: <PhoneCall className="h-4 w-4" /> },
    { id: 'results', label: 'Results', icon: <ListChecks className="h-4 w-4" />, badge: deck.assessments.length || undefined }
  ]

  return (
    <Page title={deck.title} subtitle={[deck.level, deck.exam].filter(Boolean).join(' · ') || undefined} back={() => open({ name: 'home' })}
      actions={<Button variant="ghost" size="sm" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</Button>}>
      <Card className="space-y-3 p-5">
        <p className={cn('whitespace-normal text-sm leading-relaxed', !notesOpen && 'line-clamp-2')}>{deck.summary}</p>
        <div className="flex flex-wrap items-center gap-2">
          {deck.key_concepts.map((k) => <span key={k.name} title={k.explanation}><Badge tone="primary">{k.name}</Badge></span>)}
          {(deck.quick_tips.length > 0 || deck.common_mistakes.length > 0) && (
            <button onClick={() => setNotesOpen(!notesOpen)} className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground no-drag" aria-expanded={notesOpen}>
              {notesOpen ? 'Hide deck notes' : 'Deck notes · tips & common mistakes'}
            </button>
          )}
        </div>
        {notesOpen && (
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            {deck.quick_tips.length > 0 && <ListBlock icon={<Lightbulb className="h-3.5 w-3.5 text-success" />} title="Quick tips" items={deck.quick_tips} />}
            {deck.common_mistakes.length > 0 && <ListBlock icon={<TriangleAlert className="h-3.5 w-3.5 text-warning" />} title="Common mistakes" items={deck.common_mistakes} />}
          </div>
        )}
      </Card>

      <div className="flex gap-1.5 border-b border-border" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cn('-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors no-drag',
              tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.icon}{t.label}{t.badge ? <Badge tone="primary">{t.badge}</Badge> : null}
          </button>
        ))}
      </div>

      {tab === 'study' && <StudySession deck={deck} onChanged={load} />}
      {tab === 'cards' && <CardList cards={deck.cards} />}
      {tab === 'quiz' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{deck.coach_kind === 'interview' ? 'SAGE’s mock interviewer uses your resume and the selected job description. Practice role skills and behavioural questions, then review feedback and weak areas. This is practice, not a hiring decision.' : 'SAGE’s AI tutor asks questions, explains concepts when you struggle, and creates a post-call assessment with weak areas and a study plan.'}</p>
          <CallPanel
            title={deck.coach_kind === 'interview' ? 'Mock placement interview' : 'Spoken quiz'}
            preflightPath={`/v1/exam-prep/calls/preflight?deck_id=${deck.id}`}
            createPath="/v1/exam-prep/calls"
            createBody={{ deck_id: deck.id }}
            pollPath={(cid) => `/v1/exam-prep/calls/${cid}`}
            retryPath={(cid) => `/v1/exam-prep/calls/${cid}/analyze`}
            simulate={me?.user.role === 'superadmin' ? { path: '/v1/exam-prep/calls/simulate', body: { deck_id: deck.id } } : null}
            isAnalysed={(c: CallState) => !!c.assessment}
            onDone={(c) => { if (c.assessment) open({ name: 'assessment', id: c.assessment.id, deckId: deck.id }) }}
          />
        </div>
      )}
      {tab === 'results' && (
        deck.assessments.length === 0 ? <Card className="p-6 text-sm text-muted-foreground">No quizzes yet. Take a spoken quiz to see where you stand.</Card> : (
          <div className="space-y-2">
            {deck.assessments.map((a) => (
              <button key={a.id} className="w-full text-left no-drag" disabled={a.status !== 'succeeded'} onClick={() => open({ name: 'assessment', id: a.id, deckId: deck.id })}>
                <Card className="flex items-center gap-4 p-4 transition-colors hover:bg-secondary/60">
                  <ScoreRing score={a.overall_score ?? 0} size={44} />
                  <div className="flex-1">
                    <div className="text-sm font-bold">{a.readiness ? READINESS_LABEL[a.readiness] : a.status}</div>
                    <div className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</div>
                  </div>
                  {a.readiness && <Badge tone={READINESS_TONE[a.readiness]}>{a.overall_score}%</Badge>}
                </Card>
              </button>
            ))}
          </div>
        )
      )}
    </Page>
  )
}

function StudySession({ deck, onChanged }: { deck: Deck; onChanged: () => void }) {
  const reduce = useReducedMotion()
  const [queue, setQueue] = useState<CueCard[] | null>(null)
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [done, setDone] = useState(0)

  const load = useCallback(async () => {
    const r = await api.get<{ items: CueCard[] }>(`/v1/exam-prep/decks/${deck.id}/study?limit=30`)
    setQueue(r.items)
    setI(0)
    setFlipped(false)
  }, [deck.id])
  useEffect(() => { void load() }, [load])

  const card = queue?.[i]
  const rate = useCallback(async (rating: 1 | 2 | 3 | 4) => {
    if (!card) return
    void api.post(`/v1/exam-prep/cards/${card.id}/review`, { rating })
    setDone((d) => d + 1)
    setFlipped(false)
    setShowHint(false)
    if (rating === 1) setQueue((q) => (q ? [...q, card] : q)) // "again" cards come back in this session
    setI((x) => x + 1)
  }, [card])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (e.code === 'Space') { e.preventDefault(); setFlipped((f) => !f) }
      if (flipped && ['1', '2', '3', '4'].includes(e.key)) void rate(Number(e.key) as 1 | 2 | 3 | 4)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, flipped, rate])

  if (!queue) return <Spinner className="text-primary" />
  if (!card) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <div className="text-lg font-bold">{done ? `Nice — ${done} review${done === 1 ? '' : 's'} done` : 'Nothing due right now'}</div>
        <p className="max-w-sm whitespace-normal text-sm text-muted-foreground">Cards come back just before you'd forget them. Take a spoken quiz to test yourself for real.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { onChanged(); void load() }}><RotateCcw className="h-4 w-4" /> Check again</Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Card {Math.min(i + 1, queue.length)} of {queue.length}</span>
        <span className="flex items-center gap-2"><Badge tone="muted">{card.concept}</Badge><Badge tone={card.difficulty === 'hard' ? 'warning' : 'muted'}>{card.difficulty}</Badge></span>
      </div>
      <button className="block w-full text-left no-drag" onClick={() => setFlipped(!flipped)} aria-label="Flip card">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${card.id}-${flipped}`} initial={{ opacity: 0, y: reduce ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <Card className={cn('flex min-h-[15rem] flex-col justify-center p-8', flipped && 'bg-primary/[0.06]')}>
              <div className="mono mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{flipped ? 'Answer' : 'Question'}</div>
              <div className={cn('whitespace-pre-wrap', flipped ? 'text-base leading-relaxed' : 'font-display text-xl font-bold')}>{flipped ? card.back : card.front}</div>
              {flipped && card.mnemonic && <div className="mt-4 flex items-start gap-2 text-sm text-primary"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0" /><span className="whitespace-normal">{card.mnemonic}</span></div>}
              {!flipped && showHint && card.hint && <div className="mt-4 whitespace-normal text-sm text-muted-foreground">Hint: {card.hint}</div>}
            </Card>
          </motion.div>
        </AnimatePresence>
      </button>
      {!flipped ? (
        <div className="flex justify-center gap-2">
          {card.hint && !showHint && <Button variant="ghost" onClick={() => setShowHint(true)}>Show hint</Button>}
          <Button onClick={() => setFlipped(true)}>Show answer <kbd className="mono ml-1 rounded bg-primary-foreground/20 px-1.5 text-[10px]">space</kbd></Button>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {([[1, 'Again', 'destructive'], [2, 'Hard', 'outline'], [3, 'Good', 'subtle'], [4, 'Easy', 'success']] as const).map(([r, label, variant]) => (
            <Button key={r} variant={variant} onClick={() => void rate(r)}>{label} <kbd className="mono text-[10px] opacity-70">{r}</kbd></Button>
          ))}
        </div>
      )}
    </div>
  )
}

function CardList({ cards }: { cards: CueCard[] }) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => cards.filter((c) => !q || `${c.front} ${c.back} ${c.concept}`.toLowerCase().includes(q.toLowerCase())), [cards, q])
  return (
    <div className="space-y-3">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cards…" />
      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((c) => (
          <Card key={c.id} className="space-y-2 p-4">
            <div className="flex items-center gap-2"><Badge tone="muted">{c.concept}</Badge><span className="text-[11px] text-muted-foreground">{c.card_type} · {c.difficulty}</span>
              {c.lapses > 0 && <Badge tone="warning" className="ml-auto">{c.lapses}× missed</Badge>}</div>
            <div className="whitespace-normal text-sm font-bold">{c.front}</div>
            <div className="whitespace-normal text-sm text-muted-foreground">{c.back}</div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ================================================================= assessment ("where you stand")
export function AssessmentPage({ id, back, open }: { id: string; back: () => void; open: (v: View) => void }) {
  const [a, setA] = useState<Assessment | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void api.get<Assessment>(`/v1/exam-prep/assessments/${id}`).then(setA).catch((e) => setError(errorMessage(e))) }, [id])
  if (!a) return <Page title="Quiz results" back={back}>{error ? <p className="text-destructive">{error}</p> : <Spinner className="text-primary" />}</Page>
  const o = a.output
  const verdictIcon = { correct: <CheckCircle2 className="h-4 w-4 text-success" />, partially_correct: <CircleAlert className="h-4 w-4 text-warning" />,
    incorrect: <XCircle className="h-4 w-4 text-destructive" />, not_answered: <CircleAlert className="h-4 w-4 text-muted-foreground" /> }
  const masteryTone = { strong: 'success', partial: 'warning', weak: 'destructive', not_assessed: 'muted' } as const

  return (
    <Page title="Where you stand" subtitle={a.deck_title ?? a.topic ?? undefined} back={back}
      actions={a.deck_id ? <Button size="sm" onClick={() => open({ name: 'deck', id: a.deck_id!, tab: 'study' })}><Brain className="h-4 w-4" /> Review weak cards</Button> : undefined}>
      {a.is_simulated && <p className="rounded-[var(--radius-input)] bg-warning/10 p-3 text-xs font-semibold text-warning">SIMULATED QUIZ — generated for QA. No real call took place.</p>}
      <Card className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
        <ScoreRing score={o.overall_score} size={112} />
        <div className="min-w-0 flex-1 space-y-2">
          <Badge tone={READINESS_TONE[o.readiness]}>{READINESS_LABEL[o.readiness]}</Badge>
          <p className="whitespace-normal text-sm leading-relaxed">{o.summary}</p>
          <p className="whitespace-normal text-sm font-semibold text-primary">{o.encouragement}</p>
          <p className="text-[11px] text-muted-foreground">Analysis confidence {Math.round(o.confidence * 100)}% · {timeAgo(a.created_at)}</p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h3 className="font-bold">Concept mastery</h3>
          {o.concepts.map((c) => (
            <div key={c.concept} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-semibold">{c.concept}</span>
                <Badge tone={masteryTone[c.mastery]}>{c.mastery === 'not_assessed' ? 'not asked' : `${c.mastery} · ${c.score}%`}</Badge>
              </div>
              {c.mastery !== 'not_assessed' && <Progress value={c.score / 100} />}
              <p className="whitespace-normal text-xs text-muted-foreground">{c.evidence}</p>
            </div>
          ))}
        </Card>
        <Card className="space-y-4 p-5">
          <h3 className="font-bold">Your study plan</h3>
          <ol className="space-y-3">
            {o.study_plan.map((s, idx) => (
              <li key={idx} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{idx + 1}</span>
                <span className="min-w-0 flex-1 whitespace-normal">{s.step}<span className="mt-0.5 block text-xs text-muted-foreground">{s.focus_concept} · {s.minutes} min</span></span>
              </li>
            ))}
          </ol>
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            {o.strengths.length > 0 && <ListBlock icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />} title="Strengths" items={o.strengths} />}
            {o.gaps.length > 0 && <ListBlock icon={<Target className="h-3.5 w-3.5 text-warning" />} title="Gaps" items={o.gaps} />}
          </div>
        </Card>
      </div>

      {o.misconceptions.length > 0 && (
        <Card className="space-y-3 p-5">
          <h3 className="font-bold">Misconceptions to fix</h3>
          {o.misconceptions.map((m, idx) => (
            <div key={idx} className="grid gap-2 rounded-[var(--radius-input)] bg-background/60 p-3 text-sm sm:grid-cols-2">
              <div className="flex gap-2 whitespace-normal"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />{m.misconception}</div>
              <div className="flex gap-2 whitespace-normal"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />{m.correction}</div>
            </div>
          ))}
        </Card>
      )}

      <Card className="space-y-2 p-5">
        <h3 className="font-bold">Question by question</h3>
        {o.questions.map((q, idx) => (
          <details key={idx} className="group rounded-[var(--radius-input)] bg-background/60 p-3">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold no-drag">{verdictIcon[q.verdict]}<span className="min-w-0 flex-1 truncate">{q.question}</span><span className="text-xs font-normal text-muted-foreground">{q.concept}</span></summary>
            <div className="mt-3 space-y-2 whitespace-normal pl-6 text-sm">
              <p><span className="text-muted-foreground">You said: </span>{q.student_answer}</p>
              <p><span className="text-muted-foreground">Feedback: </span>{q.feedback}</p>
            </div>
          </details>
        ))}
        {o.transcript_gaps.length > 0 && <p className="pt-2 text-xs text-muted-foreground">Transcript notes: {o.transcript_gaps.join(' · ')}</p>}
      </Card>
    </Page>
  )
}

// ================================================================= shared bits
export function Page({ title, subtitle, back, actions, children }: {
  title: string; subtitle?: string; back?: () => void; actions?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 px-8 pb-12 pt-12">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {back && <button onClick={back} className="mb-2 flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground no-drag"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>}
            <h1 className="text-[length:var(--text-display,2rem)] font-bold leading-tight">{title}</h1>
            {subtitle && <p className="mt-1 whitespace-normal text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  )
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value?: React.ReactNode; accent?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">{icon}{label}</div>
      <div className={cn('mt-2 font-display text-2xl font-bold', accent && 'text-primary')}>{value ?? <Spinner className="h-4 w-4" />}</div>
    </Card>
  )
}

function ListBlock({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div className="rounded-[var(--radius-input)] bg-background/60 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 font-semibold">{icon}{title}</div>
      <ul className="space-y-1 text-muted-foreground">{items.map((t, i) => <li key={i} className="whitespace-normal">• {t}</li>)}</ul>
    </div>
  )
}

export function ScoreRing({ score, size = 96 }: { score: number; size?: number }) {
  const r = 42
  const c = 2 * Math.PI * r
  const tone = score >= 85 ? 'var(--color-success)' : score >= 65 ? 'var(--color-accent)' : score >= 40 ? 'var(--color-warning)' : 'var(--color-danger)'
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`Score ${score} percent`} className="shrink-0">
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-rule)" strokeWidth="9" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={tone} strokeWidth="9" strokeLinecap="round" strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 50 50)" />
      <text x="50" y="56" textAnchor="middle" fontSize="22" fontWeight="700" fill="currentColor">{score}%</text>
    </svg>
  )
}

