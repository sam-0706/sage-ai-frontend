const {spawnSync}=require('node:child_process');
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 let values={};
 for(const name of ['AutA','auta']){
  const child=spawnSync(require('electron'),['scripts/read-auta-secrets.cjs'],{env:{...process.env,AUTA_SOURCE_APP_NAME:name,AUTA_MIGRATION_PIPE:'1'},encoding:'utf8',timeout:15000});
  try{values=JSON.parse(child.stdout);if(Object.keys(values).length)break;}catch{}
 }
 if(!Object.keys(values).length){console.log('Source credentials remain protected by the AutA keychain identity; no plaintext written.');return;}
 const app=await electron.launch({executablePath:'release/mac-arm64/SAGE AI.app/Contents/MacOS/SAGE AI',args:[]});
 try{
 const encrypted=await app.evaluate(({safeStorage},data)=>{const out={};for(const [k,v] of Object.entries(data))out[k]=safeStorage.encryptString(v).toString('base64');return out;},values);
 values={};
 const dir=path.join(process.env.HOME,'Library/Application Support/sage-ai-desktop'),dest=path.join(dir,'secrets.json');
 const bag=fs.existsSync(dest)?JSON.parse(fs.readFileSync(dest,'utf8')):{};let count=0;
 for(const [k,v] of Object.entries(encrypted)){
  const usable = bag[k] ? await app.evaluate(({safeStorage},enc)=>{try{safeStorage.decryptString(Buffer.from(enc,'base64'));return true;}catch{return false;}},bag[k]) : false;
  if(!usable){bag[k]=v;count++;}
 }
 fs.writeFileSync(dest,JSON.stringify(bag),{mode:0o600});
 const reportPath=path.join(dir,'auta-import.json'),report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
 report.secrets=`${count} credentials transferred through OS encryption; existing SAGE credentials preserved`;
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{mode:0o600});
 console.log('Encrypted credentials transferred:',count);
 }finally{await app.close();}
})().catch(()=>{console.error('Credential transfer unavailable. Source unchanged.');process.exitCode=1});
