import { useEffect, useState } from 'react'
import type { Application, Job } from '@shared/types'
import { useAuta } from '@/state'
import { Badge, Button, Card, Input, Progress, Spinner } from '@/components/ui'
import { cn, decodeEntities, timeAgo } from '@/lib/utils'

const ATS_LABEL: Record<Job['atsType'], string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workday: 'Workday',
  icims: 'iCIMS',
  taleo: 'Taleo',
  linkedin: 'LinkedIn',
  generic: 'Generic'
}
import { Plus, Play, Rocket, Ban, ImageIcon, ExternalLink, RotateCcw, Trash2, Eraser, ArrowRight, Link2, ShieldAlert, FileCheck2 } from 'lucide-react'

const STATUS_TONE: Record<Application['status'], 'muted' | 'primary' | 'warning' | 'success' | 'destructive'> = {
  queued: 'muted',
  running: 'primary',
  paused_checkpoint: 'warning',
  submitted: 'success',
  failed: 'destructive',
  skipped: 'muted'
}
const STATUS_LABEL: Record<Application['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  paused_checkpoint: 'Needs you',
  submitted: 'Submitted',
  failed: 'Failed',
  skipped: 'Skipped'
}

export function Dashboard({ onOpenLive }: { onOpenLive: (appId: string) => void }) {
  const { applications, latestShot, refresh } = useAuta()
  const [jobs, setJobs] = useState<Job[]>([])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadJobs = async () => setJobs(await window.auta.listJobs())
  useEffect(() => {
    loadJobs()
  }, [applications.length])

  const add = async () => {
    if (!url.trim()) return
    setError('')
    try {
      const parsed = new URL(url.trim())
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an http or https job link.')
    } catch {
      setError('Paste a complete job URL, including https://')
      return
    }
    setBusy(true)
    try {
      await window.auta.addJob(url.trim())
      setUrl('')
      await loadJobs()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const appliedJobIds = new Set(applications.map((a) => a.jobId))
  const pendingJobs = jobs.filter((j) => !appliedJobIds.has(j.id))

  const counts = {
    running: applications.filter((a) => a.status === 'running' || a.status === 'paused_checkpoint').length,
    submitted: applications.filter((a) => a.status === 'submitted').length,
    queued: applications.filter((a) => a.status === 'queued').length + pendingJobs.length,
    failed: applications.filter((a) => a.status === 'failed').length
  }

  return (
    <div className="h-full overflow-y-auto px-8 pb-10 pt-12">
      <div className="mx-auto max-w-6xl">
      <div className="mb-7 flex items-end justify-between gap-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> WORKBENCH</div>
          <h1 className="font-display text-[2rem] font-bold tracking-[-0.04em]">Apply workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">Add job links. SAGE fills each application and pauses only when your judgment is required.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              await window.auta.clearInactiveApplications()
              await refresh()
            }}
            disabled={!applications.some((a) => ['failed', 'skipped', 'submitted'].includes(a.status))}
          >
            <Eraser className="h-4 w-4" /> Clear finished
          </Button>
          <Button
            variant="default"
            onClick={async () => {
              await window.auta.startApplyAll()
              await refresh()
            }}
            disabled={pendingJobs.length === 0}
          >
            <Rocket className="h-4 w-4" /> Apply to all ({pendingJobs.length})
          </Button>
        </div>
      </div>

      <Card className="relative mb-5 overflow-hidden p-5">
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-35" />
        <div className="relative flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Link2 className="h-3.5 w-3.5" /> Job application URL</label>
            <Input
              aria-invalid={!!error}
              placeholder="Paste a Greenhouse, Lever, Workday, LinkedIn, or other job link"
              value={url}
              onChange={(e) => { setUrl(e.target.value); if (error) setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              className="h-12 bg-background/85 px-4"
            />
          </div>
          <Button onClick={add} loading={busy} size="lg">
            <Plus className="h-4 w-4" /> Add to queue
          </Button>
        </div>
        {error && <div className="relative mt-2 text-xs font-medium text-destructive">{error}</div>}
      </Card>

      <div className="mb-7 grid grid-cols-4 gap-3">
        <Stat label="In progress" value={counts.running} tone="text-primary" />
        <Stat label="Submitted" value={counts.submitted} tone="text-success" />
        <Stat label="Queued" value={counts.queued} tone="text-foreground" />
        <Stat label="Failed" value={counts.failed} tone="text-destructive" />
      </div>

      {counts.running > 0 && applications.some((a) => a.status === 'paused_checkpoint') && (
        <button onClick={() => onOpenLive(applications.find((a) => a.status === 'paused_checkpoint')!.id)} className="mb-4 flex w-full items-center gap-3 rounded-[var(--radius-card)] bg-warning/12 px-4 py-3 text-left text-warning transition-colors hover:bg-warning/18">
          <ShieldAlert className="h-5 w-5" />
          <span className="text-sm font-semibold">An application needs you</span>
          <span className="text-xs text-warning/75">Open the live run to clear its verification gate.</span>
          <ArrowRight className="ml-auto h-4 w-4" />
        </button>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-[-0.02em]">Application queue</h2>
        <span className="mono text-[10px] text-muted-foreground">{applications.length + pendingJobs.length} TOTAL</span>
      </div>
      <div className="space-y-2.5">
        {applications.map((a) => (
          <Card key={a.id} className="flex items-center gap-4 p-3.5 animate-fade-in transition-[transform,background-color] duration-[var(--dur-short)] hover:-translate-y-px hover:bg-card/95">
            <Thumb src={
              a.status === 'submitted' && a.screenshotPath
                ? `file://${a.screenshotPath}`
                : latestShot[a.id] || (a.screenshotPath ? `file://${a.screenshotPath}` : undefined)
            } />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{decodeEntities(a.job.title || a.job.url)}</span>
                <Badge tone="muted">{ATS_LABEL[a.job.atsType]}</Badge>
                <Badge tone={STATUS_TONE[a.status]}>
                  {(a.status === 'running' || a.status === 'paused_checkpoint') && <Spinner className="h-3 w-3" />}
                  {STATUS_LABEL[a.status]}
                </Badge>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {a.job.company} {a.currentStep ? `· ${a.currentStep}` : ''}
              </div>
              {(a.status === 'running' || a.status === 'paused_checkpoint') && (
                <div className="mt-2">
                  <Progress value={a.progress ?? 0} />
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {(a.status === 'running' || a.status === 'paused_checkpoint') && (
                <>
                  <Button size="sm" variant="subtle" onClick={() => onOpenLive(a.id)}>
                    Live <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => window.auta.cancelApply(a.id)}>
                    <Ban className="h-3.5 w-3.5" /> Cancel
                  </Button>
                </>
              )}
              {a.error && a.status !== 'submitted' && (
                <span className="max-w-[160px] truncate text-xs text-destructive/80" title={a.error}>
                  {a.error}
                </span>
              )}
              {(a.status === 'failed' || a.status === 'skipped') && (
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={async () => {
                    await window.auta.startApply(a.jobId)
                    await refresh()
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Retry
                </Button>
              )}
              {a.status === 'submitted' && (
                <Button size="sm" variant="subtle" onClick={() => onOpenLive(a.id)}>
                  <FileCheck2 className="h-3.5 w-3.5" /> Receipt
                </Button>
              )}
              <a aria-label="Open job listing" href={a.job.url} target="_blank" rel="noreferrer" className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ExternalLink className="h-4 w-4" />
              </a>
              {['failed', 'skipped', 'submitted'].includes(a.status) && (
                <button
                  title="Remove"
                  onClick={async () => {
                    await window.auta.removeApplication(a.id)
                    await refresh()
                  }}
                  className="rounded-md p-2 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </Card>
        ))}

        {pendingJobs.map((j) => (
          <Card key={j.id} className="flex items-center gap-4 p-3.5">
            <Thumb />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{decodeEntities(j.title || j.url)}</span>
                <Badge tone="muted">{ATS_LABEL[j.atsType]}</Badge>
                <Badge tone="muted">Not started</Badge>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {j.company} · added {timeAgo(j.discoveredAt)}
              </div>
            </div>
            <Button
              size="sm"
              onClick={async () => {
                await window.auta.startApply(j.id)
                await refresh()
              }}
            >
              <Play className="h-3.5 w-3.5" /> Apply
            </Button>
          </Card>
        ))}

        {applications.length === 0 && pendingJobs.length === 0 && (
          <Card className="relative flex flex-col items-center gap-3 overflow-hidden py-20 text-center text-muted-foreground">
            <div className="surface-grid pointer-events-none absolute inset-0 opacity-40" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary"><Rocket className="h-6 w-6 text-primary" /></div>
            <div className="relative"><p className="text-sm font-semibold text-foreground">Your queue is clear</p><p className="mt-1 text-xs">Paste a job link above to start the first application.</p></div>
          </Card>
        )}
      </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3"><div className={cn('font-display text-2xl font-bold tabular-nums', tone)}>{value}</div><div className="text-xs font-semibold text-muted-foreground">{label}</div></div>
    </Card>
  )
}

function Thumb({ src }: { src?: string }) {
  return (
    <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[0.65rem] bg-background shadow-[inset_0_0_0_1px_oklch(var(--border))]">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
      )}
    </div>
  )
}
