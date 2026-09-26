import { useEffect, useState } from 'react'
import { courses, attendanceMath, curriculumSource, curriculumNotice } from '@shared/academics'
import catalogue from '@shared/bitsom-catalogue.json'
import { useSage } from '@/sage/state'
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui'

type RecordRow = { attended: number; held: number }
const initialRows = () => courses.slice(0, 6).map((_, i) => ({attended: [14, 17, 18, 12, 16, 15][i], held: 20}))
export function Academics() {
  const { me } = useSage()
  return <Attendance key={me?.user.id} owner={me?.user.id ?? 'demo'} name={me?.user.full_name ?? 'Korada'} />
}
function Attendance({ owner, name }: { owner: string; name: string }) {
  const key = `sage:bitsom:attendance:v1:${owner}`
  const [rows, setRows] = useState<RecordRow[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (Array.isArray(saved) && saved.length === 6 && saved.every(r => { attendanceMath(r.attended,r.held,75); return true })) return saved } catch { /* seed demo */ }
    return initialRows()
  })
  const [target, setTarget] = useState('75')
  const [future,setFuture]=useState('236')
  const [futureAttended,setFutureAttended]=useState('170')
  const [clock, setClock] = useState(new Date())
  const [storageError, setStorageError] = useState('')
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(rows)); setStorageError('') } catch { setStorageError('Changes are shown for this session but could not be saved on this device.') } }, [key, rows])
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 30000); return () => clearInterval(t) }, [])
  const total = rows.reduce((a,r) => ({attended:a.attended+r.attended,held:a.held+r.held}), {attended:0,held:0})
  const summary = attendanceMath(total.attended,total.held,Number(target))
  const day = Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',weekday:'short'}).format(clock) === 'Sun' ? 6 : ['Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',weekday:'short'}).format(clock)))
  const time = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(clock)
  return <section className="space-y-4" aria-label="BITSoM academic dashboard">
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">BITSoM MBA · 2026</h2><Badge tone="warning">Synthetic demo</Badge></div>
      <p className="text-sm text-muted-foreground">{name} · Demo attendance and timetable, updated locally. No student portal is connected. The target is a planning assumption, not a verified BITSoM policy.</p>
      <div className="flex items-end gap-6"><div><p className="text-xs text-muted-foreground">Attendance · {total.attended}/{total.held} classes</p><p className="text-3xl font-bold">{summary.percentage?.toFixed(1)}%</p></div><Field label="Target attendance"><Select value={target} onChange={e => setTarget(e.target.value)} options={['75','80','85','90','100']} /></Field></div>
      <p className="text-sm">{summary.needed === null ? '100% cannot be recovered after an absence.' : summary.needed ? `Attend the next ${summary.needed} classes consecutively to reach ${target}% overall.` : `Target reached. You can miss ${summary.canMiss} more classes overall and stay at ${target}% or above.`}</p>
      <p className="text-xs text-muted-foreground">Calculation: attended ÷ held × 100. Recovery: ceiling((target × held − 100 × attended) ÷ (100 − target)). Course requirements are calculated separately below.</p>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Upcoming classes in your scenario"><Input type="number" min="0" value={future} onChange={e=>setFuture(e.target.value)} /></Field><Field label="Classes you will attend"><Input type="number" min="0" max={future} value={futureAttended} onChange={e=>setFutureAttended(e.target.value)} /></Field></div><p className="text-sm">{Number(future)>=0 && Number(futureAttended)>=0 && Number(futureAttended)<=Number(future) ? `Attend ${futureAttended} of the next ${future} classes → ${total.attended+Number(futureAttended)} / ${total.held+Number(future)} = ${((total.attended+Number(futureAttended))/(total.held+Number(future))*100).toFixed(1)}% attendance.` : 'Enter a valid scenario: attended classes must be between zero and upcoming classes.'}</p>
      {storageError && <p role="alert" className="text-sm text-destructive">{storageError}</p>}
    </Card>
    <div className="grid gap-3 lg:grid-cols-2">{rows.map((r,i) => {
      const calc = attendanceMath(r.attended,r.held,Number(target))
      return <Card className="space-y-3 p-4" key={courses[i].id}><div className="flex justify-between gap-3"><h3 className="font-bold">{courses[i].name}</h3><Badge tone={calc.needed ? 'warning' : 'success'}>{calc.percentage?.toFixed(1)}%</Badge></div>
        <p className="text-sm text-muted-foreground">{r.attended} attended / {r.held} held · {calc.needed === null ? '100% no longer reachable' : calc.needed ? `${calc.needed} consecutive classes needed` : `Can miss ${calc.canMiss} classes`}</p>
        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setRows(prev => prev.map((v,j) => i === j ? {held:v.held+1,attended:v.attended+1} : v))}>Demo: attended</Button><Button size="sm" variant="ghost" onClick={() => setRows(prev => prev.map((v,j) => i === j ? {...v,held:v.held+1} : v))}>Demo: missed</Button></div></Card>
    })}</div>
    <Card className="space-y-3 p-5"><div className="flex justify-between"><h2 className="font-bold">This week’s timetable</h2><Badge tone="warning">Generated demo · IST</Badge></div><p className="text-xs text-muted-foreground">Illustrative recurring schedule for the demo; not BITSoM’s official block timetable. Live clock: {time} IST.</p>
      <div className="grid gap-2 sm:grid-cols-3">{['Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i) => <div key={d} className="rounded-lg bg-secondary/60 p-3"><h3 className="mb-2 font-semibold">{d}</h3>{['09:00','11:00'].map((start,j) => { const current = day === i && time >= start && time < (j ? '12:30' : '10:30'); return <p key={start} className="mb-2 text-xs"><strong>{start}–{j ? '12:30':'10:30'}</strong> · {courses[(i+j)%6].name} {current && <Badge tone="primary">Now · demo</Badge>}</p> })}</div>)}</div>
      <Button size="sm" variant="ghost" onClick={() => setRows(initialRows())}>Reset demo attendance</Button>
    </Card>
  </section>
}

export function BitsomPrep() {
  const { me } = useSage()
  const [course, setCourse] = useState(courses[0].id)
  const [term, setTerm] = useState('1')
  const [quiz, setQuiz] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [answer, setAnswer] = useState('')
  const [index, setIndex] = useState(0)
  const [ratings, setRatings] = useState<boolean[]>([])
  const [filter, setFilter] = useState('all')
  const selected = courses.find(c => c.id === course)!
  const card = selected.cards[index]
  const reset = () => { setIndex(0); setRatings([]); setRevealed(false); setAnswer('') }
  const finish = (known: boolean) => { setRatings(prev => [...prev, known]); setIndex(i => i+1); setRevealed(false); setAnswer('') }
  return <div className="h-full overflow-y-auto px-8 pb-8 pt-12"><div className="mx-auto max-w-6xl space-y-5">
    <div><h1 className="text-2xl font-bold">BITSoM MBA cue cards</h1><p className="mt-1 text-sm text-muted-foreground">2026 demo · {me?.user.full_name ?? 'Korada'} · 18 core-course topics · 36 ready-to-study cards</p></div>
    <Card className="space-y-3 p-5"><Badge tone="warning">Demo learning material</Badge><p className="text-xs text-muted-foreground">{curriculumNotice} This is a core-course starter library, not the full MBA syllabus.</p><Button size="sm" variant="ghost" onClick={() => void window.sage.openExternal(curriculumSource)}>View curriculum reference</Button>
      <details className="rounded-lg bg-secondary/50 p-3"><summary className="cursor-pointer text-sm font-semibold">Imported curriculum · both years, core/electives &amp; workplace courses</summary><p className="my-2 text-xs text-muted-foreground">Published catalogue, retrieved {catalogue.retrieved}. Elective allocation and current official details require verification.</p>{catalogue.tables.map((table, year) => { let currentTerm = ''; return <div key={year} className="my-3"><h3 className="font-bold">Year {year+1}</h3><table className="mt-2 w-full text-left text-xs"><thead><tr>{table[0].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{table.slice(1).map((row,i) => { if (row.length === 3) currentTerm = row[0]; const values = row.length === 3 ? row : [currentTerm, ...row]; return <tr className="border-t border-border" key={i}>{values.map((v,j) => <td className="p-2" key={j}>{v}</td>)}</tr> })}</tbody></table></div> })}</details>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Term"><Select value={term} onChange={e => { setTerm(e.target.value); setCourse(courses.find(c => c.term === Number(e.target.value))!.id); reset() }} options={['1','2','3']} /></Field><Field label="Course topic"><Select value={course} onChange={e => {setCourse(e.target.value);reset()}} options={courses.filter(c => c.term === Number(term)).map(c => ({value:c.id,label:c.name}))} /></Field></div>
      <div className="flex gap-2"><Button variant={!quiz ? 'default':'outline'} onClick={() => {setQuiz(false);reset()}}>Cue cards · questions &amp; answers</Button><Button variant={quiz ? 'default':'outline'} onClick={() => {setQuiz(true);reset()}}>Quiz</Button></div>
    </Card>
    {!quiz ? <div className="grid gap-4 lg:grid-cols-2">{selected.cards.map(c => <Card className="space-y-3 p-6" key={c.question}><Badge tone="primary">{selected.name}</Badge><p className="text-xs font-semibold text-muted-foreground">QUESTION</p><h2 className="text-lg font-bold">{c.question}</h2><p className="border-t border-border pt-3 text-xs font-semibold text-muted-foreground">ANSWER</p><p className="text-sm leading-relaxed">{c.answer}</p></Card>)}</div> : card ? <Card className="mx-auto max-w-2xl space-y-4 p-6"><p className="text-xs text-muted-foreground">Question {index+1} / {selected.cards.length}</p><h2 className="text-xl font-bold">{card.question}</h2><Field label="Your answer (self-assessment)"><Input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Recall the answer before revealing it" /></Field>{!revealed ? <Button onClick={() => setRevealed(true)}>Reveal answer</Button> : <><p className="rounded-lg bg-secondary p-4 text-sm">{card.answer}</p><div className="flex gap-2"><Button onClick={() => finish(true)}>Got it</Button><Button variant="outline" onClick={() => finish(false)}>Needs review</Button></div></>}</Card> : <Card className="space-y-4 p-6"><h2 className="text-xl font-bold">Quiz complete · {ratings.filter(Boolean).length}/{ratings.length} marked understood</h2><p className="text-xs text-muted-foreground">Self-assessed, not an AI or official grade.</p><Select value={filter} onChange={e => setFilter(e.target.value)} options={[{value:'all',label:'All cards'},{value:'review',label:'Needs review'},{value:'known',label:'Understood'}]} />{selected.cards.filter((_,i) => filter === 'all' || ratings[i] === (filter === 'known')).map(c => <div className="space-y-1 rounded-lg bg-secondary p-4" key={c.question}><h3 className="font-bold">{c.question}</h3><p className="text-sm">{c.answer}</p></div>)}<Button onClick={reset}>Try quiz again</Button></Card>}
  </div></div>
}
