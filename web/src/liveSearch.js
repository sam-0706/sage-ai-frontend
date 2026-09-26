const cache = new Map()
const pending = new Map()
const TTL = 30 * 60 * 1000
const MAX_AGE = 24 * 60 * 60 * 1000
const cacheKey = (userId,kind,body) => `sage:discovery:v2:${JSON.stringify([userId,kind,body])}`
export function readSearch(userId,kind,body) {
  if(!userId) return null
  const key=cacheKey(userId,kind,body)
  try {
    const entry=cache.get(key) || JSON.parse(localStorage.getItem(key) || 'null')
    if(entry && Array.isArray(entry.data?.items) && Date.now()-entry.time<MAX_AGE) return entry
  } catch { /* Storage can be unavailable. Live research still works. */ }
  return null
}
export async function liveSearch(client,userId,kind,body,force=false) {
  const key=cacheKey(userId,kind,body)
  if(pending.has(key)) return pending.get(key)
  const previous=readSearch(userId,kind,body)
  if(!force && previous && Date.now()-previous.time<TTL) return previous.data
  const request=client.request('POST',kind.startsWith('exposure:')?'/v1/campus/exposure/discover':'/v1/campus/jobs/discover',body)
    .then(data=>{
      const entry={time:Date.now(),data}; cache.set(key,entry)
      if(userId)try{localStorage.setItem(key,JSON.stringify(entry))}catch{/* optional cache */}
      return data
    }).finally(()=>pending.delete(key))
  pending.set(key,request)
  return request
}
