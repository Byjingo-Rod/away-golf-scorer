import assert from 'node:assert/strict';
import * as M from '../matchplay-model.mjs';
import {createMatchplayService} from '../server/matchplay-service.mjs';
import {createMatchplayConnection} from '../matchplay-connection.mjs';
const state=M.sampleDivision(18);state.config.format='scratch';state.config.finalMode='players';state.published=true;const ids=M.opponents(state,'r0m0');
let record={revision:0,state,receipts:[]};const resource={eventId:'review',gradeId:'men-1'};
const service=createMatchplayService({store:{async read(){return structuredClone(record);},async compareAndSwap(r,revision,next){if(record.revision!==revision)return false;record=structuredClone(next);return true;}},membership:async id=>({role:'player',playerId:ids[id==='a'?0:1]})});
const request=id=>async(action,command)=>action==='read'?service.read({userId:id},resource):service.command({userId:id},resource,command);
const memory=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
let displayed=[];const a=createMatchplayConnection({request:request('a'),storage:memory(),key:'a',playerSide:()=> 'a',onState:s=>displayed.push(s.state.matches.r0m0.holes[1]?.selfA)}),b=createMatchplayConnection({request:request('b'),storage:memory(),key:'b',playerSide:()=> 'b'});
await a.refresh();await b.refresh();await Promise.all([a.enqueue({operation:'acknowledge',key:'r0m0'}),b.enqueue({operation:'acknowledge',key:'r0m0'})]);
await a.refresh();await b.refresh();await Promise.all([a.enqueue({operation:'score',key:'r0m0',hole:1,kind:'own',value:4}),b.enqueue({operation:'score',key:'r0m0',hole:1,kind:'own',value:5})]);
assert.equal(record.state.matches.r0m0.holes[1].selfA,4);assert.equal(record.state.matches.r0m0.holes[1].selfB,5);
await Promise.all([a.enqueue({operation:'score',key:'r0m0',hole:1,kind:'own',value:5}),a.enqueue({operation:'score',key:'r0m0',hole:1,kind:'own',value:6}),a.enqueue({operation:'score',key:'r0m0',hole:1,kind:'own',value:7})]);
assert.equal(record.state.matches.r0m0.holes[1].selfA,7);assert.ok(displayed.includes(6));assert.equal(a.pending,0);
const old=(await request('a')('read')).revision;await a.enqueue({operation:'score',key:'r0m0',hole:1,kind:'own',value:8});await assert.rejects(request('a')('command',{operation:'score',key:'r0m0',hole:1,kind:'own',value:2,baseValue:7,expectedRevision:old,requestId:crypto.randomUUID()}),e=>e.code==='revision_conflict');
// A decided result with missing own checks can be explicitly accepted by both sides.
record={revision:0,state:M.sampleDivision(18),receipts:[]};record.state.config.format='scratch';record.state.config.finalMode='players';record.state.published=true;
for(const id of ids){record.state.matches.r0m0.acknowledgements??={};record.state.matches.r0m0.acknowledgements[id]='yes';}
for(let h=1;h<=10;h++){M.recordScores(record.state,'r0m0','a',h,null,5);M.recordScores(record.state,'r0m0','b',h,null,3);}
const c=createMatchplayConnection({request:request('a'),storage:memory(),key:'c',playerSide:()=> 'a'}),d=createMatchplayConnection({request:request('b'),storage:memory(),key:'d',playerSide:()=> 'b'});await c.refresh();await d.refresh();await Promise.all([c.enqueue({operation:'confirm_result',key:'r0m0'}),d.enqueue({operation:'confirm_result',key:'r0m0'})]);assert.ok(record.state.matches.r0m0.result);
console.log('Concurrent independent entries, rapid optimistic taps, true same-field conflicts and simultaneous final confirmations passed');
