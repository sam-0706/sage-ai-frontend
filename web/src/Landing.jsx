import { useState } from 'react'
import { useSignIn } from '@clerk/react'
import { ArrowRight, ArrowUpRight, BookOpen, BriefcaseBusiness, CalendarDays, Check, ChevronRight, GraduationCap, LoaderCircle, Network, Sparkles, Target } from 'lucide-react'
import './landing.css'

const views = {
  Plan: { icon: CalendarDays, title: 'A little clarity. A lot of progress.', label: 'YOUR SEMESTER, CONNECTED', items: ['Build a plan around your career goal', 'Make space for classes and focused work', 'Turn projects into portfolio evidence'], footer: 'From a long-term goal to your next small step.' },
  Prepare: { icon: BookOpen, title: 'Understand it. Then make it yours.', label: 'LEARNING WITH DIRECTION', items: ['Break a subject into useful quick notes', 'Practice with question-and-answer cards', 'Prepare for interviews with your resume'], footer: 'Bring your learning and career preparation together.' },
  Discover: { icon: BriefcaseBusiness, title: 'Find where your ambition belongs.', label: 'OPPORTUNITIES WITH CONTEXT', items: ['Search for roles around your profile', 'Compare requirements with your skills', 'Explore people, projects and internships'], footer: 'Give your next opportunity a more intentional start.' },
}

export default function Landing() {
  const { signIn } = useSignIn()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('Plan')
  const active = views[view]
  const Icon = active.icon
  async function startGoogle() {
    if (busy || !signIn) return
    setBusy(true)
    setError('')
    try {
      const result = await signIn.sso({ strategy: 'oauth_google', redirectUrl: '/', redirectCallbackUrl: '/sso-callback' })
      if (result?.error) throw result.error
    } catch (err) {
      setError(err.errors?.[0]?.longMessage || err.message || 'Google sign-in could not start. Please try again.')
      setBusy(false)
    }
  }
  const signInButton = (label = 'Continue with Google') => <button className="lp-primary" disabled={busy || !signIn} onClick={startGoogle}>{busy ? <LoaderCircle size={19} className="spin" /> : <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a5.5 5.5 0 1 1-1.5-6.6l2.9-2.8A10 10 0 1 0 12 22c5.8 0 9.6-4.1 9.6-9.8Z"/></svg>}{busy ? 'Connecting to Google…' : label}<ArrowRight size={17}/></button>
  return <main className="lp">
    <header className="lp-nav"><a href="#" className="lp-brand" aria-label="SAGE home"><span><Sparkles size={21}/></span>SAGE</a><nav aria-label="Main navigation"><a href="#platform">The platform</a><a href="#path">Your path</a><a href="#connections">Connections</a></nav><button onClick={startGoogle} disabled={busy || !signIn} className="lp-signin">Sign in <ArrowUpRight size={17}/></button></header>
    {error && <div className="lp-error" role="alert">{error} <button onClick={startGoogle} disabled={busy}>Try again</button></div>}
    <section className="lp-hero">
      <div className="lp-hero-copy"><div className="lp-eyebrow"><span/> A LITTLE DIRECTION CHANGES EVERYTHING</div><h1>Big ambitions.<br/>Clear steps.<br/><em>Your next chapter.</em></h1><p>Your classes, career and everything in between.<br className="lp-desktop-break"/> One thoughtful workspace to move you forward.</p>{signInButton()}<div className="lp-caption">Your Google account. Your own path.<br/>New here? We’ll help you get set up.</div></div>
      <div className="lp-preview"><div className="lp-preview-top"><span><span className="lp-mini-logo"><Sparkles size={14}/></span> YOUR PERSONAL WORKSPACE</span><span className="lp-preview-status">A clearer way forward</span></div><div className="lp-preview-content"><p className="lp-label">THE BIG PICTURE</p><h2>Make room for<br/>what’s next.</h2><div className="lp-goal"><span className="lp-icon"><Target size={23}/></span><div><small>IT STARTS WITH YOUR GOAL</small><strong>Build a career you care about</strong></div><ArrowUpRight size={20}/></div><div className="lp-tabs" role="tablist" aria-label="Explore your workspace">{Object.keys(views).map(tab=><button id={`tab-${tab}`} role="tab" aria-selected={view===tab} aria-controls="feature-panel" key={tab} onClick={()=>setView(tab)}>{tab}</button>)}</div><div id="feature-panel" role="tabpanel" aria-labelledby={`tab-${view}`} className="lp-panel"><div className="lp-panel-heading"><Icon size={20}/><span>{active.label}</span></div><h3>{active.title}</h3>{active.items.map(item=><div className="lp-task" key={item}><span><Check size={12}/></span>{item}</div>)}<p>{active.footer}</p></div></div><div className="lp-preview-bottom"><span><GraduationCap size={16}/> From campus to career</span><ArrowRight size={17}/></div></div>
    </section>
    <section className="lp-ribbon" aria-label="Workspace features"><span>Less switching.<br/><strong>More moving forward.</strong></span><div><CalendarDays/> Academic planning</div><div><BriefcaseBusiness/> Career preparation</div><div><BookOpen/> Focused learning</div><div><Network/> Meaningful connections</div></section>
    <section className="lp-platform" id="platform"><div className="lp-section-intro"><p className="lp-label">ALL THE PIECES. ONE PLACE.</p><h2>A workspace that sees<br/>the whole <em>you.</em></h2><p>Not just the next exam or the next application.<br/>Make your everyday effort part of a bigger plan.</p></div><div className="lp-feature-grid"><article className="lp-feature-main"><span className="lp-feature-number">01 / DIRECTION</span><CalendarDays size={30}/><h3>Give your ambition<br/>a place in your calendar.</h3><p>Bring semester planning, daily progress, classes and deadlines into the same picture.</p><div className="lp-mini-timeline"><span>Set your goal</span><i/><span>Build your plan</span><i/><span>Take the next step</span></div></article><article><span className="lp-feature-number">02 / OPPORTUNITY</span><BriefcaseBusiness size={27}/><h3>Your career starts<br/>before graduation.</h3><p>Explore relevant roles, prepare for interviews and keep your applications organised.</p><a href="#path">Connect the dots <ArrowUpRight size={17}/></a></article><article><span className="lp-feature-number">03 / CONFIDENCE</span><BookOpen size={27}/><h3>Learn with a little<br/>more intention.</h3><p>Quick notes, cue cards and study tools help you turn a full syllabus into focused practice.</p><a href="#path">Find your rhythm <ArrowUpRight size={17}/></a></article></div></section>
    <section className="lp-path" id="path"><div><p className="lp-label">YOUR PATH IS PERSONAL</p><h2>Start where you are.<br/><em>Go where you want.</em></h2><p>SAGE brings your interests, time and ambitions together, so your plan fits your life.</p></div><ol>{[['Tell us what matters','Your course, career goals, skills and the time you can give each day.'],['Find your direction','Connect your learning to projects, preparation and opportunities.'],['Keep moving, your way','Track your work, reflect on progress and adjust as your goals evolve.']].map(([title,desc],i)=><li key={title}><span>0{i+1}</span><div><h3>{title}</h3><p>{desc}</p></div><ChevronRight size={18}/></li>)}</ol></section>
    <section className="lp-network" id="connections"><div className="lp-network-map" aria-label="Concept map connecting students, faculty, founders and industry"><svg viewBox="0 0 500 300" aria-hidden="true"><path d="M250 150L95 60M250 150L395 60M250 150L75 245M250 150L410 245"/></svg><span className="lp-network-center"><Sparkles size={22}/>Your next chapter</span><span className="lp-network-node nn1"><GraduationCap size={19}/>Students</span><span className="lp-network-node nn2"><BookOpen size={19}/>Faculty</span><span className="lp-network-node nn3"><Target size={19}/>Founders</span><span className="lp-network-node nn4"><BriefcaseBusiness size={19}/>Industry</span></div><div><p className="lp-label">GROWTH IS A TEAM SPORT</p><h2>A bigger world.<br/><em>A closer connection.</em></h2><p>Explore how people, interests and opportunities connect. Give your goals a place beyond the classroom.</p><small>A view of the community SAGE brings together.</small></div></section>
    <section className="lp-close"><p className="lp-label">YOUR NEXT CHAPTER STARTS HERE</p><h2>Let’s make it <em>intentional.</em></h2>{signInButton('Find your next step')}</section><footer className="lp-footer"><a className="lp-brand" href="#"><span><Sparkles size={19}/></span>SAGE</a><p>Strategic Action & Growth Engine</p><small>© {new Date().getFullYear()} SAGE</small></footer>
  </main>
}
