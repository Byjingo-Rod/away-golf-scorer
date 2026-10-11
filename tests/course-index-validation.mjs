import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(process.argv[2]||'app.js','utf8');
const a=source.indexOf('  function validateCourseScorecard('),b=source.indexOf('\n  function ',a+10);
const ctx={courseScorecard:c=>c};vm.createContext(ctx);vm.runInContext(source.slice(a,b),ctx);
const make=()=>({par:Array(18).fill(4),metres:Array(18).fill(350),index:Array.from({length:18},(_,i)=>String(i+1))});
let card=make();assert(ctx.validateCourseScorecard(card).ok);
card.par[0]=6;assert(ctx.validateCourseScorecard(card).ok);
card.index=card.index.map((v,i)=>v+'/'+(19+i));assert(ctx.validateCourseScorecard(card).ok);
card.index[1]='2/19';assert(ctx.validateCourseScorecard(card).issues.some(x=>x.includes('secondary')&&x.includes('duplicate')));
for(const bad of ['1/18','1/37','1/19/20','1/']){card=make();card.index[0]=bad;assert(!ctx.validateCourseScorecard(card).ok,bad);}
card=make();card.index[0]='1/36';assert(ctx.validateCourseScorecard(card).ok);
card.index[1]='1';assert(ctx.validateCourseScorecard(card).issues.some(x=>x.includes('primary')&&x.includes('duplicate')));
console.log('Passed: single/dual indexes, optional secondary values, secondary duplicates/ranges/format, primary duplicates, and par 6.');
