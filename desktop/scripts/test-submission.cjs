const ts=require('typescript'),vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const compiled=ts.transpileModule(fs.readFileSync('src/main/engine/submissionReceipt.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}});
let regions=[];
const sandbox={exports:{},document:{querySelectorAll:()=>regions},getComputedStyle:e=>e.style};
vm.runInNewContext(compiled.outputText,sandbox);
function check(text,visible=true){regions=[{textContent:text,getBoundingClientRect:()=>({width:visible?200:0,height:100}),style:{display:'block',visibility:'visible',opacity:'1'}}];return sandbox.exports.hasVisibleSubmissionReceipt()}
assert.equal(check('Your application was sent to Cartrabbit!'),true);
assert.equal(check('Application submitted'),true);
assert.equal(check('Thank you for applying'),true);
assert.equal(check('Your application was sent to Cartrabbit!',false),false);
assert.equal(check('Review your application before submitting'),false);
assert.equal(check('Application could not be sent. Please retry.'),false);
assert.equal(check('This job requires experience with application development.'),false);
assert.equal(check('Your application was sent '+'.'.repeat(1400)),false);
console.log('PASS LinkedIn receipt, ATS receipt, hidden and non-confirmation cases');
