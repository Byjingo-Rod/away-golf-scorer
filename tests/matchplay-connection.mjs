import assert from 'node:assert/strict';
import * as M from '../matchplay-model.mjs';
import {createMatchplayService} from '../server/matchplay-service.mjs';
import {createMatchplayHandler} from '../server/matchplay-handler.mjs';
import {createMatchplayConnection} from '../matchplay-connection.mjs';
const state=M.sampleDivision(18);state.config.format='handicapped';state.config.finalMode='players';state.players.forEach((p,i)=>p.playingHcp=i===0?-2:2);M.freezeQualifyingHandicaps(state);state.published=true;
const [a,b]=M.opponents(state,'r0m0'),resource={eventId:'test-event',gradeId:'men-1'};
let record={revision:0,state,receipts:[]};
const membership=new Map([['user-a',{role:'player',playerId:a}],['user-b',{role:'player',playerId:b}],['viewer',{role:'spectator'}]]);
const store={async read(r){return r.eventId===resource.eventId&&r.gradeId===resource.gradeId?structuredClone(record):null;},async compareAndSwap(r,revision,next){if(record.revision!==revision)return false;record=structuredClone(next);return true;}};
const service=createMatchplayService({store,membership:async(user,r)=>r.eventId===resource.eventId?membership.get(user):null});
const handler=createMatchplayHandler({service,allowedOrigin:'https://review.example',authenticate:async token=>membership.has(token)?{userId:token}:null});
function request(user){return async(action,command)=>{const response=await handler(new Request('https://service.example/',{method:'POST',headers:{Authorization:user,'Content-Type':'application/json',Origin:'https://review.example'},body:JSON.stringify({...resource,action,command})}));const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{code:result.code,status:response.status});return result;};}
const sendA=request('user-a'),sendB=request('user-b');
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
const phoneA=createMatchplayConnection({request:sendA,storage:memory(),key:'a'}),phoneB=createMatchplayConnection({request:sendB,storage:memory(),key:'b'});
await phoneA.refresh();await phoneB.refresh();
await phoneA.enqueue({operation:'acknowledge',key:'r0m0'});
await phoneB.refresh();await phoneB.enqueue({operation:'acknowledge',key:'r0m0'});
await phoneA.refresh();await phoneA.enqueue({operation:'score',key:'r0m0',hole:1,kind:'own',value:4});
await phoneA.enqueue({operation:'score',key:'r0m0',hole:1,kind:'marked',value:5});
await phoneB.refresh();await phoneB.enqueue({operation:'score',key:'r0m0',hole:1,kind:'own',value:5});
await phoneB.enqueue({operation:'score',key:'r0m0',hole:1,kind:'marked',value:4});
assert.equal(M.matchState(record.state,'r0m0').played,1);
assert.equal(M.matchState(record.state,'r0m0').issues,0);
await assert.rejects(request('viewer')('command',{operation:'score'}),e=>e.code==='read_only');
await assert.rejects(request('stranger')('read'),e=>e.status===401);
await assert.rejects(sendA('command',{operation:'score',key:'r0m1',hole:1,kind:'own',value:1,requestId:crypto.randomUUID(),expectedRevision:record.revision}),e=>e.code==='wrong_match');
await assert.rejects(sendA('command',{operation:'score',actor:b,requestId:crypto.randomUUID(),expectedRevision:record.revision}),e=>e.code==='invalid_command');
// Simultaneous writes cannot erase each other. The stale phone preserves its unsent entry.
await phoneA.refresh();await phoneB.refresh();await phoneA.enqueue({operation:'score',key:'r0m0',hole:2,kind:'own',value:4});
await assert.rejects(phoneB.enqueue({operation:'score',key:'r0m0',hole:2,kind:'own',value:5}),e=>e.code==='revision_conflict');
assert.equal(phoneB.pending,1);assert.equal((await phoneB.reviewConflict()).pending[0].value,5);
await phoneB.discardPendingAndReload();assert.equal(phoneB.pending,0);
// A response lost after durable saving is retried exactly once after reopening the phone.
const storage=memory();let drop=true;
const unreliable=async(action,command)=>{const result=await sendA(action,command);if(action==='command'&&drop){drop=false;throw Error('Connection lost');}return result;};
let retryPhone=createMatchplayConnection({request:unreliable,storage,key:'retry'});await retryPhone.refresh();
await assert.rejects(retryPhone.enqueue({operation:'score',key:'r0m0',hole:2,kind:'marked',value:5}));
const savedRevision=record.revision;retryPhone=createMatchplayConnection({request:unreliable,storage,key:'retry'});await retryPhone.flush();assert.equal(record.revision,savedRevision);assert.equal(retryPhone.pending,0);
// Concessions require the other authenticated opponent then advance with no invented scores.
await phoneA.refresh();await phoneA.enqueue({operation:'concede_hole',key:'r0m0',hole:2,by:'b'});
await assert.rejects(sendA('command',{operation:'confirm_concession',key:'r0m0',hole:2,requestId:crypto.randomUUID(),expectedRevision:record.revision}),e=>e.code==='invalid_state');
await phoneB.refresh();await phoneB.enqueue({operation:'confirm_concession',key:'r0m0',hole:2});assert.equal(M.matchState(record.state,'r0m0').played,2);
// An eliminated player retains reading access with scoring denied by server state.
await phoneA.refresh();await phoneA.enqueue({operation:'concede_match',key:'r0m0'});
await phoneA.enqueue({operation:'confirm_result',key:'r0m0'});await phoneB.refresh();await phoneB.enqueue({operation:'confirm_result',key:'r0m0'});
assert.equal(M.playerJourney(record.state,a).status,'eliminated');assert.ok((await sendA('read')).state);
await assert.rejects(sendA('command',{operation:'score',key:'r0m0',hole:3,kind:'own',value:4,requestId:crypto.randomUUID(),expectedRevision:record.revision}),e=>['wrong_match','round_closed'].includes(e.code));
assert.ok(!(await request('viewer')('read')).state.players[0].registrationNo);
const denied=await handler(new Request('https://service.example',{method:'POST',headers:{Origin:'https://untrusted.example',Authorization:'user-a'},body:'{}'}));assert.equal(denied.status,403);
console.log('Connected scoring contract passed: two independent clients, scoped identity, stale write rejection, durable retry, concession confirmation, advancement and spectator access.');
