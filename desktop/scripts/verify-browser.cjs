const {chromium}=require('playwright');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 const dir=path.join(process.env.HOME,'Library/Application Support/sage-ai-desktop');
 const ctx=await chromium.launchPersistentContext(path.join(dir,'browser-profile'),{headless:false});
 try {
  const cookies=await ctx.cookies();
  const status={checkedAt:new Date().toISOString(),googleSessionCookiePresent:cookies.some(c=>/(^|\.)google\.com$/.test(c.domain)&&/^(SID|__Secure-1PSID|__Secure-3PSID)$/.test(c.name)),linkedinSessionCookiePresent:cookies.some(c=>/(^|\.)linkedin\.com$/.test(c.domain)&&c.name==='li_at')};
  const page=await ctx.newPage();
  for(const [name,url] of [['google','https://myaccount.google.com/'],['linkedin','https://www.linkedin.com/feed/']]){
   try {await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});status[name+'Result']=new URL(page.url()).hostname+new URL(page.url()).pathname;}catch{status[name+'Result']='navigation unavailable';}
  }
  const p=path.join(dir,'auta-import.json');const r=JSON.parse(fs.readFileSync(p,'utf8'));r.browserValidation=status;r.browser=`Imported browser profile checked: Google session ${status.googleSessionCookiePresent?'cookie present':'not found'}; LinkedIn session ${status.linkedinSessionCookiePresent?'cookie present':'not found'}`;fs.writeFileSync(p,JSON.stringify(r,null,2),{mode:0o600});
  console.log(JSON.stringify(status));
 }finally{await ctx.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
