import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const helper=app.slice(app.indexOf('  function isTestEventName('),app.indexOf('  function retainedTestEvent()'));
const isTest=vm.runInNewContext(helper+';isTestEventName');
for(const name of ['TEST - Scorecard update','Player Short Day 2 TEST','Record All Scores TEST — Copy','Manual Score Entry - Test 2','Away Golf - 15.38 Test']){
 assert(isTest(name),name);assert(isTest({name}),name);
}
for(const name of ['Away Golf - Federal GC','Contest Golf','St Georges Basin & Mollymook'])assert(!isTest({name}),name);
console.log('TEST-event storage recognises complete TEST words anywhere in names, including the older retained test names.');
