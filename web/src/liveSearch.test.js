import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSearch, liveSearch } from './liveSearch.js'

const storage=new Map()
globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}
test('loads persisted results immediately and isolates accounts',async()=>{
 const key='sage:discovery:v2:'+JSON.stringify(['alice','exposure:faculty',{kind:'faculty'}])
 storage.set(key,JSON.stringify({time:Date.now(),data:{items:[{title:'Verified research opening'}]}}))
 assert.equal(readSearch('alice','exposure:faculty',{kind:'faculty'}).data.items.length,1)
 assert.equal(readSearch('bob','exposure:faculty',{kind:'faculty'}),null)
 const client={request:()=>{throw new Error('Fresh cache must not fetch')}}
 assert.equal((await liveSearch(client,'alice','exposure:faculty',{kind:'faculty'})).items.length,1)
})
test('deduplicates refreshes and preserves previous results on network failure',async()=>{
 let reject,requests=0
 const key='sage:discovery:v2:'+JSON.stringify(['carol','jobs',{}])
 storage.set(key,JSON.stringify({time:Date.now()-3600000,data:{items:[{title:'Last result'}]}}))
 const client={request:()=>{requests++;return new Promise((_,r)=>{reject=r})}}
 const first=liveSearch(client,'carol','jobs',{}),second=liveSearch(client,'carol','jobs',{})
 reject(new Error('Offline'))
 await Promise.all([assert.rejects(first,/Offline/),assert.rejects(second,/Offline/)])
 assert.equal(requests,1)
 assert.equal(readSearch('carol','jobs',{}).data.items[0].title,'Last result')
})
test('expires results after 24 hours',()=>{
 const key='sage:discovery:v2:'+JSON.stringify(['old','jobs',{}])
 storage.set(key,JSON.stringify({time:Date.now()-86400001,data:{items:[]}}))
 assert.equal(readSearch('old','jobs',{}),null)
})
