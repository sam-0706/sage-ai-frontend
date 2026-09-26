// Invoked only by migrate-credentials.cjs; stdout is a private, captured pipe.
if (process.env.AUTA_MIGRATION_PIPE !== '1' || process.stdout.isTTY) throw new Error('Use migrate-credentials.cjs; this helper requires a captured private pipe.');
const {app,safeStorage}=require('electron');
const fs=require('node:fs'),path=require('node:path');
app.setName(process.env.AUTA_SOURCE_APP_NAME || 'AutA');
app.whenReady().then(()=>{
 const src=JSON.parse(fs.readFileSync(path.join(process.env.HOME,'Library/Application Support/auta/secrets.json'),'utf8'));
 const out={};
 for(const [k,v] of Object.entries(src))if(/^(provider:|credential:|gmail:|skyvern:)/.test(k))try{out[k]=safeStorage.decryptString(Buffer.from(v,'base64'));}catch{}
 process.stdout.write(JSON.stringify(out));app.quit();
});
