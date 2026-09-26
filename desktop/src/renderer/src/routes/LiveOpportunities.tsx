import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '@/sage/api'
import { useSage } from '@/sage/state'
import { Button, Card, Input, Badge } from '@/components/ui'

const cache = new Map<string,{time:number;data:any}>()
const pending = new Map<string,Promise<any>>()
function readCache(key:string): {time:number;data:any}|undefined {
 try {
  const saved=cache.get(key)??JSON.parse(localStorage.getItem(`sage:discovery:v2:${key}`)||'null')
  if(saved&&Array.isArray(saved.data?.items)&&Date.now()-saved.time<86400000)return saved
 }catch{/* Cache is optional. */}
}
export function LiveOpportunities({view}:{view:string}) {
 const {me}=useSage()
 const kind=({research:'faculty',networking:'networking'} as Record<string,string>)[view]??view
 const [state,setState]=useState<any>(()=>({...readCache(`${me?.user.id}:${kind}`)?.data,items:readCache(`${me?.user.id}:${kind}`)?.data.items??[],busy:true,error:''}))
 const [query,setQuery]=useState('')
 const refresh=useCallback(async(force=false)=>{
  const key=`${me?.user.id}:${kind}`
  setState((s:any)=>({...s,busy:true,error:''}))
  try {
   const previous=readCache(key)
   let data
   if(!force&&previous&&Date.now()-previous.time<1800000)data=previous.data
   else {
    let task=pending.get(key)
    if(!task){task=api.post(kind==='jobs'?'/v1/campus/jobs/discover':'/v1/campus/exposure/discover',kind==='jobs'?{}:{kind}).then(data=>{const entry={data,time:Date.now()};cache.set(key,entry);try{localStorage.setItem(`sage:discovery:v2:${key}`,JSON.stringify(entry))}catch{/* optional cache */}return data}).finally(()=>pending.delete(key));pending.set(key,task)}
    data=await task
   }
   setState({...data,busy:false,error:''})
  } catch(e){setState((s:any)=>({...s,busy:false,error:errorMessage(e)}))}
 },[me?.user.id,kind])
 useEffect(()=>{void refresh();const id=setInterval(()=>{if(document.visibilityState==='visible')void refresh()},1800000);return()=>clearInterval(id)},[refresh])
 return <><Card className="p-5 space-y-3"><div className="flex gap-3"><Input placeholder="Filter by role, club or organisation" value={query} onChange={e=>setQuery(e.target.value)}/><Button loading={state.busy} onClick={()=>void refresh(true)}>Refresh live</Button></div><p className="text-xs text-muted-foreground">{state.searched_at?`Sources checked ${new Date(state.searched_at).toLocaleString('en-IN')}. Refreshes every 30 minutes while open.`:'Searching current public sources…'} {kind==='jobs'?'Market openings; campus placement eligibility is not confirmed.':''}</p><p className="text-sm">{state.summary}</p></Card>{state.error&&<p role="alert" className="text-destructive">{state.error}</p>}{state.busy&&<p role="status">{state.searched_at?'Updating sources in the background…':'Researching current opportunities…'}</p>}<div className="grid gap-4 sm:grid-cols-2">{state.items.filter((x:any)=>`${x.title} ${x.organisation??x.company}`.toLowerCase().includes(query.toLowerCase())).map((x:any)=><Card className="p-5 space-y-3" key={x.source_url+x.title}><Badge>{x.organisation??x.company}</Badge><h2 className="text-xl font-bold">{x.title}</h2><p>{x.location}{x.salary?` · ${x.salary}`:''}</p><p className="text-sm text-muted-foreground">{x.description??x.why_it_fits?.join(' · ')}</p>{typeof x.why_it_fits==='string'&&<p className="text-sm">{x.why_it_fits}</p>}<p className="text-xs">{x.availability}{x.deadline?` · Deadline: ${x.deadline}`:''}</p>{x.match_score!==undefined&&<Badge tone="primary">{x.match_score}% profile fit</Badge>}<div className="flex flex-wrap gap-2">{(x.action_url||x.apply_url)&&<Button onClick={()=>void window.sage.openExternal(x.action_url||x.apply_url)}>{kind==='clubs'?'View joining details':x.action_label||'View & apply'}</Button>}<Button variant="outline" onClick={()=>void window.sage.openExternal(x.source_url)}>View source</Button></div></Card>)}</div>{!state.busy&&!state.error&&!state.items.length&&<p>No verified openings found. Try refreshing later.</p>}</>
}
