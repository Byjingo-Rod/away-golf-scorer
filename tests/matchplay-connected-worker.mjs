import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const [bundle,migration]=process.argv.slice(2);const worker=(await import(pathToFileURL(bundle))).default,sql=new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(migration,'utf8'));
const DB={prepare(query){
 return {bind(...args){
  return {async first(){return sql.prepare(query).get(...args)||null;},async run(){return {meta:sql.prepare(query).run(...args)};}};
 }};
}};
async function api(body,token='',owner='review-owner',origin='https://review.test'){const response=await worker.fetch(new Request('https://review.test/api/matchplay-review',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(owner?{'oai-authenticated-user-id':owner}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),{DB});return{status:response.status,body:await response.json()};}
assert.equal((await api({action:'join',role:'alex',code:'TEST1'},'','')).status,401);
assert.equal((await api({action:'join',role:'alex',code:'TEST1'},'','review-owner','https://evil.test')).status,403);
const a=(await api({action:'join',role:'alex',code:'TEST1'})).body,b=(await api({action:'join',role:'parker',code:'TEST1'})).body,v=(await api({action:'join',role:'spectator',code:'TEST1'})).body;
assert.ok(a.token&&b.token);assert.notEqual(a.playerId,b.playerId);
assert.equal((await api({action:'read'},a.token,'other-owner')).status,401);
const snap=await api({action:'read'},a.token);assert.equal(snap.status,200);assert.equal(snap.body.revision,0);
let revision=0;async function command(token,c){const r=await api({action:'command',command:{requestId:crypto.randomUUID(),expectedRevision:revision,key:'r0m0',...c}},token);assert.equal(r.status,200,JSON.stringify(r.body));revision=r.body.revision;return r.body;}
await command(a.token,{operation:'acknowledge'});await command(b.token,{operation:'acknowledge'});
await command(a.token,{operation:'score',hole:1,kind:'own',value:4});await command(a.token,{operation:'score',hole:1,kind:'marked',value:5});await command(b.token,{operation:'score',hole:1,kind:'own',value:5});await command(b.token,{operation:'score',hole:1,kind:'marked',value:4});
let shared=(await api({action:'read'},v.token)).body;assert.equal(shared.state.matches.r0m0.holes[1].selfA,4);assert.equal(shared.state.matches.r0m0.holes[1].selfB,5);
assert.equal((await api({action:'command',command:{operation:'score'}},v.token)).status,403);
assert.equal((await api({action:'command',command:{operation:'score',key:'r0m0',hole:2,kind:'own',value:1,requestId:crypto.randomUUID(),expectedRevision:0}},b.token)).status,409);
await command(a.token,{operation:'concede_hole',hole:2,by:'b'});await command(b.token,{operation:'confirm_concession',hole:2});
shared=(await api({action:'read'},v.token)).body;assert.equal(shared.state.matches.r0m0.holes[2].concededTo,'a');
const retry={operation:'score',key:'r0m0',hole:3,kind:'own',value:4,requestId:crypto.randomUUID(),expectedRevision:revision};const first=await api({action:'command',command:retry},a.token),again=await api({action:'command',command:retry},a.token);assert.equal(first.status,200);assert.equal(again.body.revision,first.body.revision);assert.equal(again.body.replayed,true);
const fresh=(await api({action:'join',role:'alex',code:'NEW1'})).body;assert.equal((await api({action:'read'},fresh.token)).body.revision,0);
assert.equal((await worker.fetch(new Request('https://review.test/connected-review'),{DB})).status,200);
console.log('Connected Worker + SQL passed: owner isolation, scoped views, cloud read/write, atomic revision guard, receipt replay, concession confirmation and new test codes.');
