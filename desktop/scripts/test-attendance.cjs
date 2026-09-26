const ts=require('typescript'),vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const result=ts.transpileModule(fs.readFileSync('src/shared/academics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}});
const sandbox={exports:{}};vm.runInNewContext(result.outputText,sandbox);
const f=sandbox.exports.attendanceMath;
assert.equal(f(14,20,75).needed,4);
assert.equal(f(12,20,80).needed,20);
assert.equal(f(93,121,80).needed,19);
assert.equal(f(18,20,80).canMiss,2);
assert.equal(f(0,0,75).percentage,null);
assert.equal(f(19,20,100).needed,null);
assert.equal(f(20,20,100).needed,0);
for(const values of [[21,20,75],[-1,20,75],[1.2,20,75],[1,2,0],[1,2,101]])assert.throws(()=>f(...values));
// Check minimality of the integer recovery across many inputs, not just examples.
for(let h=1;h<100;h++)for(let a=0;a<=h;a++)for(const t of [75,80,85,90]){
 const {needed:n,canMiss:m}=f(a,h,t);assert((a+n)*100 >= (h+n)*t);
 if(n>0)assert((a+n-1)*100 < (h+n-1)*t);
 if(a*100>=h*t){assert(a*100>=(h+m)*t);assert(a*100<(h+m+1)*t);}
}
console.log('PASS attendance recovery/minimality, absence allowance, zero classes, 100% and invalid inputs');
