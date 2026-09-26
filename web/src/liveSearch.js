const cache = new Map()
const pending = new Map()
const TTL = 30 * 60 * 1000
// In-memory and account-scoped: switching accounts never reuses another profile's results.
export async function liveSearch(client, userId, kind, body, force = false) {
  const key = JSON.stringify([userId,kind,body])
  if(pending.has(key)) return pending.get(key)
  const cached=cache.get(key)
  if(!force && cached && Date.now()-cached.time<TTL)return cached.data
  const request=client.request('POST',kind.startsWith('exposure:')?'/v1/campus/exposure/discover':'/v1/campus/jobs/discover',body)
    .then(data=>{cache.set(key,{time:Date.now(),data});return data})
    .finally(()=>pending.delete(key))
  pending.set(key,request)
  return request
}
