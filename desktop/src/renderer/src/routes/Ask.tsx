import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCirclePlus, SendHorizonal, Trash2 } from 'lucide-react'
import { api, errorMessage } from '@/sage/api'
import { Badge, Button, Card, Spinner, Textarea } from '@/components/ui'
import { cn, timeAgo } from '@/lib/utils'

interface Session { id: string; title: string; updated_at: string }
interface Citation { n: number; title: string; heading: string | null; is_demo: boolean; url: string | null; snippet?: string }
interface Msg { id?: string; role: 'user' | 'assistant'; content: string; citations?: Citation[]; safety?: { crisis?: boolean } }

const STARTERS = [
  'My attendance is below 75% — what are my options?',
  'Who should I contact about a section change?',
  'How do I prepare for placements in analytics?',
  'Make me a 1-week plan to recover in Statistics'
]

export function Ask() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  const loadSessions = useCallback(async () => {
    const r = await api.get<{ items: Session[] }>('/v1/chat/sessions')
    setSessions(r.items)
    return r.items
  }, [])

  useEffect(() => { void loadSessions() }, [loadSessions])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  const openSession = async (id: string) => {
    setActive(id)
    setError('')
    const r = await api.get<{ items: Msg[] }>(`/v1/chat/sessions/${id}/messages`)
    setMessages(r.items)
  }

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || busy) return
    setBusy(true)
    setError('')
    setInput('')
    try {
      let sid = active
      if (!sid) {
        const s = await api.post<Session>('/v1/chat/sessions', {})
        sid = s.id
        setActive(sid)
      }
      setMessages((m) => [...m, { role: 'user', content }])
      const r = await api.post<{ message_id: string; content: string; citations: Citation[]; safety: { crisis?: boolean } }>(
        `/v1/chat/sessions/${sid}/messages`, { content, stream: false })
      setMessages((m) => [...m, { id: r.message_id, role: 'assistant', content: r.content, citations: r.citations, safety: r.safety }])
      void loadSessions()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    await api.del(`/v1/chat/sessions/${id}`)
    if (active === id) { setActive(null); setMessages([]) }
    void loadSessions()
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col gap-2 border-r border-border px-3 pb-4 pt-12">
        <Button variant="outline" size="sm" onClick={() => { setActive(null); setMessages([]) }}><MessageCirclePlus className="h-4 w-4" /> New conversation</Button>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {sessions.map((s) => (
            <div key={s.id} className={cn('group flex items-center rounded-[var(--radius-input)]', active === s.id ? 'bg-secondary' : 'hover:bg-secondary/60')}>
              <button onClick={() => void openSession(s.id)} className="min-w-0 flex-1 px-3 py-2 text-left no-drag">
                <div className="truncate text-xs font-semibold">{s.title}</div>
                <div className="text-[10px] text-muted-foreground">{timeAgo(s.updated_at)}</div>
              </button>
              <button onClick={() => void remove(s.id)} className="mr-1 hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block no-drag" aria-label="Delete conversation"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6 pt-12">
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.length === 0 && (
              <div className="space-y-4 pt-8">
                <h1 className="text-3xl font-bold">Ask SAGE</h1>
                <p className="text-sm text-muted-foreground">Answers come from your college knowledge base and faculty directory, with sources. SAGE says so when it doesn't know.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {STARTERS.map((s) => <button key={s} onClick={() => void send(s)} className="rounded-[var(--radius-input)] bg-card p-3 text-left text-sm shadow-[inset_0_0_0_1px_oklch(var(--border))] hover:bg-secondary no-drag"><span className="whitespace-normal">{s}</span></button>)}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={m.id ?? i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                {m.role === 'user' ? (
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-[var(--radius-card)] bg-primary px-4 py-2.5 text-sm text-primary-foreground">{m.content}</div>
                ) : (
                  <Card className={cn('max-w-[90%] space-y-3 p-4', m.safety?.crisis && 'shadow-[inset_0_0_0_2px_oklch(var(--warning))]')}>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                    {!!m.citations?.length && (
                      <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
                        {m.citations.map((c) => (
                          <span key={c.n} title={`${c.title}\n\n${c.snippet ?? ''}`}><Badge tone="muted">[{c.n}] {c.heading ?? c.title}{c.is_demo ? ' · DEMO' : ''}</Badge></span>
                        ))}
                      </div>
                    )}
                  </Card>
                )}
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="text-primary" /> Searching the knowledge base…</div>}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <div ref={bottom} />
          </div>
        </div>
        <div className="border-t border-border px-8 py-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <Textarea rows={2} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about policies, deadlines, whom to contact, how to plan…"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) } }} />
            <Button onClick={() => void send(input)} disabled={!input.trim()} loading={busy} aria-label="Send"><SendHorizonal className="h-4 w-4" /></Button>
          </div>
        </div>
      </section>
    </div>
  )
}
