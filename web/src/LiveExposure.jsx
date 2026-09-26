import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, RefreshCw, Search, Users } from 'lucide-react'
import { liveSearch } from './liveSearch.js'

const titles = {internships:'Internships',workshops:'Live workshops',faculty:'Faculty collaborations',clubs:'BITSoM clubs',networking:'Industry events'}
export default function LiveExposure({sage, type}) {
  const [state,setState]=useState({items:[],busy:true,error:'',searched_at:null})
  const [query,setQuery]=useState('')
  const refresh=useCallback(async(force=false)=>{
    setState(s=>({...s,busy:true,error:''}))
    try {const data=await liveSearch(sage.client,sage.userId,`exposure:${type}`,{kind:type},force);setState({...data,busy:false,error:''})}
    catch(e){setState(s=>({...s,busy:false,error:e.message}))}
  },[sage.client,sage.userId,type])
  useEffect(()=>{void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh()},30*60*1000);return()=>clearInterval(timer)},[refresh])
  const items=state.items.filter(x=>`${x.title} ${x.organisation} ${x.description}`.toLowerCase().includes(query.toLowerCase()))
  return <><header className="page-head"><div><p className="eyebrow">Exposure · source-backed discovery</p><h1>{titles[type]}</h1><p>{type==='clubs'?'Find your community at BITSoM. Explore club activities and current joining routes.':'Current opportunities researched around your profile and goals.'}</p></div><button className="primary" disabled={state.busy} onClick={()=>refresh(true)}><RefreshCw className={state.busy?'spin':''}/>Refresh live</button></header><section className="search-console"><label><Search size={16}/> <input aria-label="Filter opportunities" placeholder="Search interests, organisations or skills" value={query} onChange={e=>setQuery(e.target.value)}/></label><p>{state.searched_at?`Last checked ${new Date(state.searched_at).toLocaleString('en-IN')} · Refreshes every 30 minutes while open.`:'Searching public sources. This can take a minute.'}</p><p>{state.summary}</p></section>{state.error&&<p className="inline-error" role="alert">{state.error}</p>}{state.busy&&<p role="status">Researching current sources…</p>}<section className="exposure-grid">{items.map(item=><article key={item.source_url+item.title}><Users/><small>{item.organisation}</small><h2>{item.title}</h2><b>{item.location}</b><p>{item.description}</p><p><strong>Why it fits: </strong>{item.why_it_fits}</p><p>{item.availability}{item.deadline?` · Deadline: ${item.deadline}`:''}</p>{item.action_url&&<a className="primary" href={item.action_url} target="_blank" rel="noreferrer">{type==='clubs'?'View joining details':item.action_label}<ArrowUpRight/></a>}<a href={item.source_url} target="_blank" rel="noreferrer">View official source <ArrowUpRight size={16}/></a></article>)}</section>{!state.busy&&!items.length&&!state.error&&<p>No verified opportunities found for this search. Try refreshing later.</p>}</>
}
