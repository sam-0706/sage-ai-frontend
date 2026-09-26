import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Info, PhoneCall, PhoneOff, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { api, errorMessage, newKey, type CallState, type Preflight } from '@/sage/api'
import { Badge, Button, Card, Select, Spinner } from '@/components/ui'
import { cn } from '@/lib/utils'

const FINAL = new Set(['completed', 'no_answer', 'busy', 'failed', 'cancelled'])

const STAGE: Record<CallState['status'], { label: string; tone: 'primary' | 'warning' | 'success' | 'destructive' | 'muted' }> = {
  requested: { label: 'Requested', tone: 'muted' },
  dispatching: { label: 'Placing call…', tone: 'primary' },
  dispatched: { label: 'Ringing your phone…', tone: 'primary' },
  in_progress: { label: 'On the call', tone: 'primary' },
  completed: { label: 'Call completed', tone: 'success' },
  no_answer: { label: 'No answer', tone: 'warning' },
  busy: { label: 'Line busy', tone: 'warning' },
  failed: { label: 'Call failed', tone: 'destructive' },
  cancelled: { label: 'Cancelled', tone: 'muted' }
}

interface Props {
  title: string
  preflightPath: string
  createPath: string
  createBody: Record<string, unknown>
  pollPath: (callId: string) => string
  /** superadmin QA: labelled simulated call, no phone involved */
  simulate?: { path: string; body: Record<string, unknown> } | null
  /** true once the post-call analysis for this call is available */
  isAnalysed: (call: CallState) => boolean
  /** POST path that re-runs the post-call analysis */
  retryPath: (callId: string) => string
  onDone: (call: CallState) => void
}

export function CallPanel({ title, preflightPath, createPath, createBody, pollPath, simulate, isAnalysed, retryPath, onDone }: Props) {
  const [pre, setPre] = useState<Preflight | null>(null)
  const [dest, setDest] = useState('')
  const [agree, setAgree] = useState(false)
  const [call, setCall] = useState<CallState | null>(null)
  const [busy, setBusy] = useState(false)
  const [simBusy, setSimBusy] = useState(false)
  const [error, setError] = useState('')
  const key = useRef(newKey())
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const loadPre = useCallback(async () => {
    try {
      const p = await api.get<Preflight>(preflightPath)
      setPre(p)
      setDest(p.destinations[0]?.number ?? '')
      if (p.live_call) setCall(p.live_call)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [preflightPath])

  useEffect(() => { void loadPre() }, [loadPre])

  const poll = useCallback(async (id: string) => {
    try {
      const c = await api.get<CallState>(pollPath(id))
      setCall(c)
      const settled = FINAL.has(c.status) && (c.status !== 'completed' || ['succeeded', 'failed', 'not_applicable'].includes(c.extraction_status))
      if (c.status === 'completed' && isAnalysed(c)) onDone(c)
      if (!settled) timer.current = setTimeout(() => void poll(id), 4000)
    } catch (e) {
      setError(errorMessage(e))
      timer.current = setTimeout(() => void poll(id), 8000)
    }
  }, [pollPath, isAnalysed, onDone])

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (call && !FINAL.has(call.status)) {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void poll(call.id), 3000)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.id])

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      const c = await api.post<CallState>(createPath, { ...createBody, destination: dest, consent: true, consent_version: pre?.consent_version ?? 'v1', idempotency_key: key.current })
      setCall(c)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const runSimulation = async () => {
    if (!simulate) return
    setSimBusy(true)
    setError('')
    try {
      const r = await api.post<{ call_id: string }>(simulate.path, { ...simulate.body, idempotency_key: newKey() })
      await poll(r.call_id)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSimBusy(false)
    }
  }

  const cancel = async () => {
    if (!call) return
    try {
      setCall(await api.post<CallState>(`/v1/calls/${call.id}/cancel`))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const reset = () => {
    key.current = newKey()
    setCall(null)
    setAgree(false)
    void loadPre()
  }

  if (!pre && !error) return <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Spinner /> Preparing call…</Card>

  const stage = call ? STAGE[call.status] : null
  const analysing = call?.status === 'completed' && ['pending', 'running'].includes(call.extraction_status)

  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold"><PhoneCall className="h-4 w-4 text-primary" /> {title}</h3>
          {pre && <p className="mt-1 whitespace-normal text-sm text-muted-foreground">{pre.purpose}</p>}
        </div>
        {stage && <Badge tone={stage.tone}>{stage.label}</Badge>}
      </div>

      {!call && pre && (
        <>
          {!pre.enabled && (
            <p className="flex items-start gap-2 rounded-[var(--radius-input)] bg-warning/10 p-3 text-xs text-warning">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Voice calls aren't available right now. Please try again later.
            </p>
          )}
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <Fact k="Calling" v={pre.destinations.length ? (
              pre.destinations.length > 1 ? (
                <Select value={dest} onChange={(e) => setDest(e.target.value)} options={pre.destinations.map((d) => ({ value: d.number, label: d.masked }))} />
              ) : pre.destinations[0].masked
            ) : 'Add your phone in Settings'} />
            <Fact k="Expected length" v={`~${pre.estimated_minutes} min`} />
            <Fact k="Voice minutes left" v={`${Math.floor(pre.remaining_voice_seconds / 60)} min ${pre.remaining_voice_seconds % 60}s`} />
          </div>
          {pre.may_exceed_allowance && (
            <p className="flex items-start gap-2 text-xs text-warning"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This call may exceed your remaining voice minutes and could end early.</p>
          )}
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{pre.agent_disclosure}</p>
          <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-input)] bg-background/60 p-3 text-xs leading-relaxed no-drag">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[oklch(var(--primary))]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span className="whitespace-normal">{pre.consent_text}</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={start} loading={busy} disabled={!agree || !dest || !pre.enabled}><PhoneCall className="h-4 w-4" /> Call me now</Button>
            {simulate && <Button variant="ghost" size="sm" onClick={runSimulation} loading={simBusy} disabled={busy}>Run labelled simulation (QA)</Button>}
            {simBusy && <span className="text-xs text-muted-foreground">Simulating a quiz and analysing it — about 40 seconds…</span>}
          </div>
        </>
      )}

      {call && (
        <div className="space-y-4">
          <ol className="grid grid-cols-4 gap-2 text-[11px] font-semibold">
            {['Placing', 'Ringing', 'On call', call.is_simulated ? 'Simulated' : 'Analysis'].map((s, i) => {
              const idx = { requested: 0, dispatching: 0, dispatched: 1, in_progress: 2, completed: 3, no_answer: 1, busy: 1, failed: 0, cancelled: 0 }[call.status]
              const done = i < idx || (call.status === 'completed' && call.extraction_status === 'succeeded')
              return (
                <li key={s} className={cn('rounded-full px-2 py-1.5 text-center', done ? 'bg-primary/15 text-primary' : i === idx ? 'bg-secondary text-foreground' : 'bg-secondary/50 text-muted-foreground')}>{s}</li>
              )
            })}
          </ol>
          {!FINAL.has(call.status) && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground"><Spinner className="text-primary" /> {call.status === 'in_progress' ? 'Talk naturally — hang up any time to end.' : 'Keep your phone nearby.'}</span>
              {['dispatching', 'dispatched', 'requested'].includes(call.status) && <Button variant="ghost" size="sm" onClick={cancel}><PhoneOff className="h-4 w-4" /> Cancel</Button>}
            </div>
          )}
          {analysing && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="text-primary" /> Analysing the conversation…</p>}
          {call.status === 'completed' && call.extraction_status === 'succeeded' && (
            <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Analysis ready{call.is_simulated ? ' (simulated call — labelled)' : ''}.</p>
          )}
          {call.status === 'completed' && call.extraction_status === 'failed' && (
            <div className="flex items-center justify-between gap-2 text-sm text-destructive">
              The analysis failed — your transcript is safe.
              <Button size="sm" variant="outline" onClick={async () => { await api.post(retryPath(call.id)); void poll(call.id) }}>Retry analysis</Button>
            </div>
          )}
          {FINAL.has(call.status) && call.status !== 'completed' && (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>{call.error || 'The call did not connect. Nothing was charged beyond connected time.'}</span>
              <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="h-4 w-4" /> Try again</Button>
            </div>
          )}
          {call.status === 'completed' && <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="h-4 w-4" /> New call</Button>}
        </div>
      )}

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-success" /> Calls are only placed after you confirm. No one else is contacted.</p>
    </Card>
  )
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-input)] bg-background/60 p-3">
      <div className="text-[11px] font-semibold text-muted-foreground">{k}</div>
      <div className="mt-1 font-semibold">{v}</div>
    </div>
  )
}
