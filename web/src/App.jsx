import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AuthenticateWithRedirectCallback, useAuth, useClerk, useSignIn } from '@clerk/react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import { ArrowRight, BookOpen, BriefcaseBusiness, CalendarDays, Check, ChevronRight, Command, ExternalLink, GraduationCap, LayoutDashboard, LoaderCircle, LogOut, Menu, Network, Search, Sparkles, Target, Users, X, Zap } from 'lucide-react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { createClient } from './api.js'
import { networkLinks, networkNodes, sampleJobs } from './network.js'

const nav = [
  ['/', 'Today', LayoutDashboard],
  ['/opportunities', 'Opportunities', BriefcaseBusiness],
  ['/network', 'Network map', Network],
  ['/academics', 'Academics', GraduationCap],
  ['/planner', 'Action plan', Target],
  ['/study', 'Study AI', BookOpen],
]

const exampleWorkspace = {
  profile: { target_role:'Associate Product Manager / Strategy Consultant', career_goal:'Build and lead category-defining technology products', salary_lpa:40, daily_minutes:180, specialisation:'Entrepreneurship & Innovation', skills:['Product strategy','SQL','Market research','Generative AI'], subjects:['Marketing Management','Business Statistics','Organisational Behaviour','Generative AI for Business'] },
  analytics: { tasks_completed:11, tasks_total:16, completion_percent:69, overdue:1, practice_sessions:5 },
  tasks: [
    { id:'1', title:'Turn the market-entry case into a one-page portfolio story', category:'project', status:'pending', due_at:new Date(Date.now()+86400000).toISOString(), minutes:50 },
    { id:'2', title:'Practice product sense: improve a campus workflow', category:'revision', status:'pending', due_at:new Date(Date.now()+172800000).toISOString(), minutes:35 },
    { id:'3', title:'Reach out to two operators from the fintech cluster', category:'networking', status:'done', due_at:new Date().toISOString(), minutes:20 },
  ],
  deadlines: [{ id:'d1', title:'Marketing Management — segmentation brief', category:'assignment', status:'pending', due_at:new Date(Date.now()+259200000).toISOString() }],
  assessments: [{ overall_score:78, readiness:74 }],
}

function useSage() {
  const auth = useAuth()
  const preview = import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === '1'
  const client = useMemo(() => createClient(auth.getToken), [auth.getToken])
  return { ...auth, preview, client }
}

function Brand({ compact=false }) {
  return <div className={`brand ${compact?'brand--compact':''}`}><span className="brand-mark"><Sparkles size={19}/></span><span>SAGE</span>{!compact&&<small>move with clarity</small>}</div>
}

function GoogleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.2L6.5 14Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.8A9.7 9.7 0 0 0 3.1 7.4l3.4 2.7A5.9 5.9 0 0 1 12 6Z"/></svg>
}

function Landing() {
  const { signIn } = useSignIn()
  const [busy,setBusy] = useState(false)
  const startGoogle = async () => {
    if (!signIn) return
    setBusy(true)
    await signIn.authenticateWithRedirect({ strategy:'oauth_google', redirectUrl:'/sso-callback', redirectUrlComplete:'/' })
  }
  return <main className="landing">
    <header className="public-nav"><Brand/><button className="text-button" onClick={startGoogle}>Sign in <ArrowRight size={16}/></button></header>
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow"><span/>Your ambition, operationalised</p>
        <h1>Know what<br/>moves you<br/><em>forward.</em></h1>
        <p className="hero-lede">SAGE connects your goals, classes, skills and real opportunities—then gives you the next move that matters.</p>
        <button className="google-button" disabled={busy||!signIn} onClick={startGoogle}>{busy?<LoaderCircle className="spin"/>:<GoogleIcon/>}<span>Continue with Google</span><ArrowRight size={18}/></button>
        <p className="microcopy">One sign-in. New members set up their path; returning members go straight home.</p>
      </div>
      <RouteCanvas/>
    </section>
    <section className="manifesto"><p>Built for the space between</p><h2>“I know what I want”<br/><span>and</span> “I know what to do today.”</h2></section>
    <section className="story-strip">
      <article><b>01</b><h3>See the whole picture</h3><p>Academics, attendance, applications and growth signals in one view.</p></article>
      <article><b>02</b><h3>Find real openings</h3><p>Live web research ranks five roles against your goals, proof and gaps.</p></article>
      <article><b>03</b><h3>Build useful momentum</h3><p>A daily plan turns ambition into work you can finish and show.</p></article>
    </section>
    <footer><Brand compact/><p>Strategic Action & Growth Engine</p><p>© {new Date().getFullYear()} SAGE</p></footer>
  </main>
}

function RouteCanvas() {
  return <div className="route-canvas" aria-label="A route connecting learning, people and opportunities">
    <div className="route-note">Your route · this week</div>
    <svg viewBox="0 0 620 620" role="img"><path className="route-line" d="M86 525 C150 430 90 335 205 290 S310 130 407 178 S520 277 530 83"/><path className="route-ghost" d="M90 525 C230 510 309 440 336 343 S420 269 530 83"/></svg>
    <div className="map-node node-you"><span>SK</span><strong>You</strong><small>high agency</small></div>
    <div className="map-node node-skill"><Zap/><strong>Applied AI</strong><small>skill to compound</small></div>
    <div className="map-node node-class"><BookOpen/><strong>Marketing</strong><small>today · 11:00</small></div>
    <div className="map-node node-role"><BriefcaseBusiness/><strong>5 role matches</strong><small>searched today</small></div>
    <div className="map-node node-person"><Users/><strong>Operator circle</strong><small>3 warm paths</small></div>
    <div className="route-stat"><b>73%</b><span>path readiness</span></div>
  </div>
}

function AuthGate() {
  const sage = useSage()
  const [state,setState] = useState(()=>sage.preview?{loading:false,me:{needs_onboarding:false,user:{full_name:'Sushruth Korada',email:'samsushruth@gmail.com'}},error:null}:{loading:true,me:null,error:null})
  useEffect(()=>{
    if (sage.preview || !sage.isLoaded) return
    if (!sage.isSignedIn) { queueMicrotask(()=>setState({loading:false,me:null,error:null})); return }
    sage.client.me().then(me=>setState({loading:false,me,error:null})).catch(error=>setState({loading:false,me:null,error}))
  },[sage.isLoaded,sage.isSignedIn,sage.preview,sage.client])
  if (state.loading || (!sage.isLoaded && !sage.preview)) return <FullLoader label="Opening your workspace"/>
  if (!sage.isSignedIn && !sage.preview) return <Landing/>
  if (state.error) return <ErrorState error={state.error}/>
  if (state.me?.needs_onboarding) return <Onboarding client={sage.client} me={state.me} onDone={()=>location.reload()}/>
  return <Workspace sage={sage} me={state.me}/>
}

function FullLoader({label}){return <div className="full-loader"><Brand/><div className="loader-orbit"><Sparkles/><i/></div><p>{label}</p></div>}
function ErrorState({error}){return <div className="error-state"><span>Something needs attention</span><h2>{error.message}</h2><button className="primary" onClick={()=>location.reload()}>Try again</button></div>}

function Onboarding({client,me,onDone}) {
  const [step,setStep]=useState(0), [catalog,setCatalog]=useState(null), [busy,setBusy]=useState(false)
  const [form,setForm]=useState({full_name:me?.user?.full_name||'',phone:'',program:'MBA',batch:2026,semester:1,specialisation:'Entrepreneurship & Innovation',subjects:[],target_role:'Associate Product Manager',career_goal:'Build and lead category-defining technology products',salary_lpa:35,daily_minutes:120,preferred_locations:['Mumbai','Bengaluru'],skills:['Strategy','Research']})
  useEffect(()=>{client.catalogue().then(setCatalog).catch(()=>setCatalog({specialisations:['Entrepreneurship & Innovation','Finance','Marketing'],courses:[]}))},[client])
  const update=(key,value)=>setForm(v=>({...v,[key]:value}))
  const submit=async()=>{setBusy(true);await client.completeOnboarding({full_name:form.full_name,phone:form.phone||null,mode:'student',goals:[form.career_goal],interests:['auto_apply','exam_prep'],call_consent:false,deadline_call_consent:false,profile:{...form,onboarding_version:2,institution_name:'BITSoM, Mumbai',graduation_year:2026,experience_summary:'MBA candidate building product, strategy and applied AI experience'}});onDone()}
  const steps=['Your direction','Your course','Your rhythm']
  return <main className="onboarding"><header><Brand/><div className="stepper">{steps.map((s,i)=><span key={s} className={i<=step?'active':''}>{String(i+1).padStart(2,'0')} {s}</span>)}</div></header>
    <section key={step} className="onboard-card onboard-enter">
      {step===0&&<><p className="eyebrow"><span/>Start with the outcome</p><h1>Where are you trying to go?</h1><div className="field-grid"><Field label="Your name"><input value={form.full_name} onChange={e=>update('full_name',e.target.value)}/></Field><Field label="Phone number"><input value={form.phone} placeholder="+91" onChange={e=>update('phone',e.target.value)}/></Field><Field wide label="Target role"><input value={form.target_role} onChange={e=>update('target_role',e.target.value)}/></Field><Field wide label="Career goal"><textarea value={form.career_goal} onChange={e=>update('career_goal',e.target.value)}/></Field><Field label="Dream salary (LPA)"><input type="number" value={form.salary_lpa} onChange={e=>update('salary_lpa',Number(e.target.value))}/></Field></div></>}
      {step===1&&<><p className="eyebrow"><span/>Build your academic context</p><h1>What are you learning now?</h1><div className="field-grid"><Field label="Programme"><select value={form.program} onChange={e=>update('program',e.target.value)}><option>MBA</option></select></Field><Field label="Graduating batch"><select value={form.batch} onChange={e=>update('batch',Number(e.target.value))}><option>2026</option><option>2027</option></select></Field><Field wide label="Specialisation"><select value={form.specialisation} onChange={e=>update('specialisation',e.target.value)}>{(catalog?.specialisations||[]).map(x=><option key={x}>{x}</option>)}</select></Field></div><p className="selection-label">Pick your current courses</p><div className="chips">{(catalog?.courses||[]).slice(0,16).map(c=><button key={c.title} className={form.subjects.includes(c.title)?'selected':''} onClick={()=>update('subjects',form.subjects.includes(c.title)?form.subjects.filter(x=>x!==c.title):[...form.subjects,c.title])}>{c.title}</button>)}</div></>}
      {step===2&&<><p className="eyebrow"><span/>Make the plan realistic</p><h1>How should SAGE work around you?</h1><div className="time-choice"><b>{form.daily_minutes}</b><span>minutes available each day</span><input aria-label="Minutes per day" type="range" min="30" max="300" step="15" value={form.daily_minutes} onChange={e=>update('daily_minutes',Number(e.target.value))}/></div><Field label="Preferred locations"><input value={form.preferred_locations.join(', ')} onChange={e=>update('preferred_locations',e.target.value.split(',').map(x=>x.trim()).filter(Boolean))}/></Field><p className="consent-copy">You control every application and call. SAGE uses this profile to rank opportunities, build your plan and personalise study support.</p></>}
      <div className="onboard-actions">{step>0&&<button className="secondary" onClick={()=>setStep(step-1)}>Back</button>}<button className="primary" disabled={busy||(step===1&&!form.subjects.length)} onClick={()=>step<2?setStep(step+1):submit()}>{busy?'Saving your path…':step<2?'Continue':'Enter SAGE'}<ArrowRight size={17}/></button></div>
    </section></main>
}

function Field({label,children,wide=false}){return <label className={wide?'wide':''}><span>{label}</span>{children}</label>}

function Workspace({sage,me}) {
  const [mobile,setMobile]=useState(false)
  const loc=useLocation(), navigate=useNavigate()
  const { signOut } = useClerk()
  return <div className="shell">
    <aside className={mobile?'open':''}><div className="rail-head"><Brand compact/><button className="icon-button mobile-only" onClick={()=>setMobile(false)}><X/></button></div><nav>{nav.map(([to,label,Icon])=><button key={to} className={loc.pathname===to?'active':''} onClick={()=>{navigate(to);setMobile(false)}}><Icon/><span>{label}</span><ChevronRight/></button>)}</nav><div className="rail-user"><span>{initials(me?.user?.full_name)}</span><div><strong>{me?.user?.full_name||'SAGE member'}</strong><small>{me?.user?.email}</small></div></div><button className="signout" onClick={()=>signOut()}><LogOut/>Sign out</button></aside>
    <header className="mobile-bar"><button className="icon-button" onClick={()=>setMobile(true)}><Menu/></button><Brand compact/><span>{initials(me?.user?.full_name)}</span></header>
    <main className="app-main"><Routes><Route path="/" element={<Dashboard sage={sage} me={me}/>}/><Route path="/opportunities" element={<Opportunities sage={sage}/>}/><Route path="/network" element={<NetworkPage/>}/><Route path="/academics" element={<Academics sage={sage}/>}/><Route path="/planner" element={<Planner sage={sage}/>}/><Route path="/study" element={<Study/>}/><Route path="*" element={<Navigate to="/"/>}/></Routes></main>
  </div>
}

function useWorkspace(sage){
  const [state,setState]=useState(()=>sage.preview?{loading:false,data:exampleWorkspace,error:null}:{loading:true,data:null,error:null})
  useEffect(()=>{if(sage.preview)return; sage.client.campus().then(data=>setState({loading:false,data,error:null})).catch(error=>setState({loading:false,data:null,error}))},[sage.preview,sage.client])
  return state
}

function PageHead({kicker,title,copy,action}){return <header className="page-head"><div><p className="eyebrow"><span/>{kicker}</p><h1>{title}</h1><p>{copy}</p></div>{action}</header>}

function Dashboard({sage,me}) {
  const {loading,data,error}=useWorkspace(sage)
  if(loading)return <PanelLoader label="Aligning your day"/>; if(error)return <ErrorState error={error}/>
  const a=data.analytics||{}, profile=data.profile||{}, first=(me?.user?.full_name||'there').split(' ')[0]
  const readiness=data.assessments?.[0]?.readiness||74
  return <div className="page-enter"><PageHead kicker="Friday · Your command view" title={`Good afternoon, ${first}.`} copy={`${profile.target_role||'Your next role'} · ${profile.daily_minutes||120} focused minutes available today`} action={<button className="command"><Command/>Ask SAGE <kbd>⌘ K</kbd></button>}/>
    <section className="pulse-grid"><article className="focus-card"><span className="card-index">01 · NEXT MOVE</span><h2>{data.tasks?.find(t=>t.status!=='done')?.title||'Build the first milestone in your action plan'}</h2><div><button className="dark-button">Start focus block <ArrowRight/></button><small>{data.tasks?.find(t=>t.status!=='done')?.minutes||45} minutes · highest leverage</small></div></article><article className="metric metric-lime"><small>Momentum</small><b>{a.completion_percent||0}<sup>%</sup></b><span>{a.tasks_completed||0} of {a.tasks_total||0} actions closed</span></article><article className="metric"><small>Career readiness</small><b>{readiness}<sup>%</sup></b><span>Portfolio proof is the next unlock</span></article><article className="metric metric-dark"><small>Attendance</small><b>76.7<sup>%</sup></b><span>3 classes above your safety line</span></article></section>
    <section className="dashboard-columns"><div><SectionTitle label="Today's route" action="Open planner"/><div className="timeline">{(data.tasks||[]).slice(0,4).map((t,i)=><div className={t.status==='done'?'done':''} key={t.id||i}><time>{new Date(t.due_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</time><i/>
      <span><strong>{t.title}</strong><small>{t.category} · {t.minutes||30} min</small></span>{t.status==='done'?<Check/>:<ArrowRight/>}</div>)}</div></div>
      <div className="signal-panel"><SectionTitle label="Signals worth seeing"/><div className="signal-big"><span>Role market</span><b>5 live matches</b><p>Your product + strategy profile is strongest in consumer tech and B2B software.</p><button onClick={()=>location.assign('/opportunities')}>Explore opportunities <ArrowRight/></button></div><div className="signal-row"><span><CalendarDays/> Next deadline</span><b>{data.deadlines?.[0]?.title||'No urgent deadlines'}</b></div><div className="signal-row"><span><Users/> Warm paths</span><b>3 people to learn from</b></div></div></section>
  </div>
}

function SectionTitle({label,action}){return <div className="section-title"><h2>{label}</h2>{action&&<button>{action}<ArrowRight/></button>}</div>}
function PanelLoader({label}){return <div className="panel-loader"><LoaderCircle className="spin"/><p>{label}</p></div>}

function Opportunities({sage}) {
  const [filters,setFilters]=useState({role:'',location:'Mumbai, Bengaluru or remote India',work_mode:'any'})
  const [state,setState]=useState({busy:false,items:sage.preview?sampleJobs:[],meta:null,error:null})
  const discover=async()=>{setState(s=>({...s,busy:true,error:null}));try{if(sage.preview){await new Promise(r=>setTimeout(r,900));setState({busy:false,items:sampleJobs,meta:{summary:'Three strong matches selected from current profile signals.',searched_at:new Date().toISOString()},error:null})}else{const data=await sage.client.discoverJobs(filters);setState({busy:false,items:data.items,meta:data,error:null})}}catch(error){setState(s=>({...s,busy:false,error}))}}
  return <><PageHead kicker="Opportunity intelligence" title="Five roles worth your attention." copy="SAGE searches the live web, opens the sources and ranks verified openings against your direction and evidence." action={<button className="primary" onClick={discover} disabled={state.busy}>{state.busy?<LoaderCircle className="spin"/>:<Search/>}{state.busy?'Searching the live web…':'Find my 5 roles'}</button>}/>
    <section className="search-console"><div><Field label="Role direction"><input placeholder="Use my profile" value={filters.role} onChange={e=>setFilters({...filters,role:e.target.value})}/></Field><Field label="Where"><input value={filters.location} onChange={e=>setFilters({...filters,location:e.target.value})}/></Field><Field label="Work mode"><select value={filters.work_mode} onChange={e=>setFilters({...filters,work_mode:e.target.value})}><option value="any">Any</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option><option value="onsite">On-site</option></select></Field></div><p><Sparkles/> Search reads your target role, skills, experience and salary goal. Every result links back to the page inspected.</p></section>
    {state.error&&<div className="inline-error">{state.error.message}</div>}
    {state.busy&&<SearchProgress/>}
    {!state.busy&&!state.items.length&&<EmptyJobs onClick={discover}/>} 
    {!state.busy&&state.items.length>0&&<section className="job-list"><div className="job-list-head"><p>{state.meta?.summary||'Profile-fit shortlist'}</p><span>{state.meta?.searched_at?`Updated ${new Date(state.meta.searched_at).toLocaleString('en-IN')}`:'Ready to refresh from the live web'}</span></div>{state.items.map((job,i)=><JobCard key={`${job.company}-${job.title}`} job={job} rank={i+1}/>)}</section>}
  </>
}

function SearchProgress(){return <div className="search-progress"><div className="scanner"><i/><Search/></div><div><h3>Searching beyond job titles</h3><p>Opening source pages · checking role details · scoring profile fit · selecting the strongest five</p></div></div>}
function EmptyJobs({onClick}){return <div className="empty-jobs"><span><Search/></span><h2>Your live shortlist starts here.</h2><p>Run a search and SAGE will return up to five source-backed roles aligned to your current profile.</p><button className="dark-button" onClick={onClick}>Search now <ArrowRight/></button></div>}
function JobCard({job,rank}){return <article className="job-card"><div className="job-rank">{String(rank).padStart(2,'0')}</div><div className="job-main"><p>{job.company}</p><h2>{job.title}</h2><div className="job-meta"><span>{job.location}</span><span>{job.work_mode}</span><span>{job.employment_type}</span>{job.salary&&<span>{job.salary}</span>}</div><div className="skill-row">{job.skills?.slice(0,5).map(s=><span key={s}>{s}</span>)}</div></div><div className="fit-score"><b>{job.match_score}</b><small>profile fit</small></div><div className="job-reason"><strong>Why it fits</strong>{job.why_it_fits?.map(x=><p key={x}><Check/>{x}</p>)}{job.gaps?.[0]&&<p className="gap"><Zap/>{job.gaps[0]}</p>}</div><a className="source-link" href={job.apply_url||job.source_url} target="_blank" rel="noreferrer">View source & apply <ExternalLink/></a></article>}

function NetworkPage(){return <><PageHead kicker="Opportunity graph" title="Your network is a route, not a list." copy="Explore how your skills, work and people connect to the opportunities you want."/><section className="network-layout"><NetworkGraph/><aside className="network-legend"><p>Connection types</p>{[['self','You'],['founder','Founders'],['student','Students'],['leader','Industry leaders'],['skill','Skills'],['project','Proof of work'],['opportunity','Opportunities']].map(([type,label])=><span key={type}><i className={type}/>{label}</span>)}<div><Sparkles/><strong>Suggested move</strong><p>Use the Market-entry sprint to start a conversation with the fintech founder cluster.</p><button>Build outreach plan <ArrowRight/></button></div></aside></section></>}

function NetworkGraph(){
  const ref=useRef(null), [points,setPoints]=useState([]), [selected,setSelected]=useState(networkNodes[0])
  const build=useCallback(()=>{const width=ref.current?.clientWidth||800,height=Math.max(560,ref.current?.clientHeight||620);const nodes=networkNodes.map(n=>({...n})),links=networkLinks.map(l=>({...l}));const sim=forceSimulation(nodes).force('link',forceLink(links).id(d=>d.id).distance(d=>d.source.id==='you'||d.target.id==='you'?130:105).strength(.6)).force('charge',forceManyBody().strength(-460)).force('center',forceCenter(width/2,height/2)).force('collision',forceCollide().radius(d=>d.id==='you'?62:45)).stop();for(let i=0;i<240;i++)sim.tick();setPoints(nodes.map(n=>({...n,x:Math.max(60,Math.min(width-60,n.x)),y:Math.max(60,Math.min(height-60,n.y))})))},[])
  useEffect(()=>{build();const ro=new ResizeObserver(build);if(ref.current)ro.observe(ref.current);return()=>ro.disconnect()},[build])
  const point=Object.fromEntries(points.map(n=>[n.id,n]));return <div className="graph" ref={ref}><svg width="100%" height="100%">{networkLinks.map((l,i)=>point[l.source]&&point[l.target]?<line key={i} x1={point[l.source].x} y1={point[l.source].y} x2={point[l.target].x} y2={point[l.target].y}/>:null)}{points.map(n=><g key={n.id} transform={`translate(${n.x},${n.y})`} className={`graph-node ${n.type} ${selected.id===n.id?'selected':''}`} onClick={()=>setSelected(n)}><circle r={n.id==='you'?34:25}/><text textAnchor="middle" y={n.id==='you'?56:46}>{n.label}</text></g>)}</svg><div className="graph-detail"><span>{selected.type}</span><strong>{selected.label}</strong><p>{selected.detail}</p></div></div>
}

function Academics({sage}){const {loading,data,error}=useWorkspace(sage);if(loading)return <PanelLoader label="Reading your academic week"/>;if(error)return <ErrorState error={error}/>;const subjects=data.profile?.subjects||[];return <><PageHead kicker="Academics & attendance" title="Protect the classes that compound." copy="See your week, attendance safety line and how each subject supports your target role."/><section className="academic-grid"><article className="attendance-ring"><div><b>76.7%</b><span>current attendance</span></div><h3>Your safety line is visible.</h3><p>Attend the next 5 scheduled classes to reach 78.1%. You can miss 3 of the following 22 classes and stay above 75%.</p></article><article className="course-stack"><SectionTitle label="Role-relevant subjects"/>{subjects.slice(0,5).map((s,i)=><div key={s}><span>{String(i+1).padStart(2,'0')}</span><strong>{s}</strong><small>{i<2?'High career relevance':'Core academic value'}</small><i style={{width:`${92-i*9}%`}}/></div>)}</article><article className="week-panel"><SectionTitle label="This week"/>{['Mon','Tue','Wed','Thu','Fri'].map((d,i)=><div key={d}><b>{d}</b><span>{subjects[i%Math.max(1,subjects.length)]||'MBA core class'}</span><small>{9+i%3*2}:00</small></div>)}</article></section></>}

function Planner({sage}){const [goal,setGoal]=useState('Build an interview-ready product portfolio and secure a high-growth role'),[busy,setBusy]=useState(false),[plan,setPlan]=useState(null);const generate=async()=>{setBusy(true);try{if(sage.preview){await new Promise(r=>setTimeout(r,700));setPlan({title:'8-week product proof sprint',summary:'Build one credible product case, sharpen analytical evidence and create focused conversations with operators.',milestones:[{week:1,title:'Direction locked',evidence:'Role thesis and gap map'},{week:3,title:'Proof shipped',evidence:'Published product case'},{week:6,title:'Interview ready',evidence:'Two scored mock interviews'}],tasks:exampleWorkspace.tasks})}else{const r=await sage.client.generatePlan({kind:'semester',goal,weeks:8,focus:'placements'});setPlan(r.output)}}finally{setBusy(false)}};return <><PageHead kicker="AI action planning" title="Turn the goal into a route you can finish." copy="SAGE fits learning, proof, applications and networking into the time you actually have." action={<button className="primary" onClick={generate} disabled={busy}>{busy?<LoaderCircle className="spin"/>:<Sparkles/>}{busy?'Designing your route…':'Build my plan'}</button>}/><section className="plan-builder"><Field label="The outcome I want"><textarea value={goal} onChange={e=>setGoal(e.target.value)}/></Field><div className="plan-controls"><span>8 weeks</span><span>Placements</span><span>Uses your daily time budget</span></div></section>{plan&&<section className="plan-result"><p>YOUR ROUTE</p><h2>{plan.title}</h2><p>{plan.summary}</p><div>{plan.milestones?.map((m,i)=><article key={m.title}><b>W{m.week||i+1}</b><span><strong>{m.title}</strong><small>{m.evidence}</small></span></article>)}</div></section>}</>}

function Study(){const [answer,setAnswer]=useState(false);return <><PageHead kicker="Study AI" title="Practice until the answer becomes yours." copy="Move from quick notes to recall, spoken questions and a clear readiness signal."/><section className="study-stage"><div className="study-menu"><span className="active">01 · Cue cards</span><span>02 · Spoken practice</span><span>03 · Readiness</span></div><article className="cue-card" onClick={()=>setAnswer(!answer)}><div><span>Marketing Management · Card 04 / 12</span><button>{answer?'Hide answer':'Reveal answer'}</button></div><p>{answer?'Segmentation divides a broad market into meaningful groups with shared needs or behaviours. Targeting evaluates those groups and chooses which ones the organisation will serve.':'How is market segmentation different from targeting?'}</p><small>{answer?'Answer shown · click anywhere to return to the question':'Think first. Then reveal the answer.'}</small></article><div className="study-stats"><span><b>78%</b>ready</span><span><b>3</b>weak topics</span><span><b>5</b>sessions</span></div></section></>}

function initials(name=''){return name.split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'SA'}

export default function App(){return <Routes><Route path="/sso-callback" element={<AuthenticateWithRedirectCallback/>}/><Route path="*" element={<AuthGate/>}/></Routes>}
