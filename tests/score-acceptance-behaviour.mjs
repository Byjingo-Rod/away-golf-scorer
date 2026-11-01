import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function extract(name){
 const start=app.search(new RegExp('  (?:async )?function '+name+'\\('));assert(start>=0,name);
 const rest=app.slice(start+3),end=rest.search(/\n  (?:async )?function /);
 return app.slice(start,end<0?app.length:start+3+end);
}
function phone(method){
 const nodes=new Map();let inputs=[];let durable=true,online=false,uploads=0,completed=0;const alerts=[];
 const host={};
 Object.defineProperty(host,'innerHTML',{get(){return this.html||'';},set(html){
   this.html=html;nodes.clear();nodes.set('#playerExperience',host);inputs=[];
   for(const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){
     const tag=match[0];nodes.set('#'+match[1],{value:tag.match(/\bvalue="([^"]*)"/)?.[1]||'',disabled:/\sdisabled/.test(tag)});
   }
   for(const match of html.matchAll(/<input\b[^>]*data-full(gross|putts)="(\d+)"[^>]*>/g)){
     const tag=match[0],kind=match[1];inputs.push({dataset:{[kind==='gross'?'fullgross':'fullputts']:match[2]},value:tag.match(/\bvalue="([^"]*)"/)?.[1]||'',focus(){},select(){}});
   }
 }});
 nodes.set('#playerExperience',host);
 const receipt={acknowledged:true,pending:false,conflict:false,blocked:false,finalisedAt:null,finalScoreConfirmedAt:null};
 const event={name:'Synthetic',days:1,course1:'c',scoringMethods:{day1:method},playerRoundMode:method==='fullCardPlayer'?'fullCardEntry':'finalEntry',scoring:{day1:{p1:{}}},fullCardDrafts:{day1:{p1:{holes:Object.fromEntries(Array.from({length:18},(_,i)=>[i+1,{gross:'4',putts:'2'}]))}}}};
 const c={store:{event,cloud:{role:'player',eventId:'synthetic',playerId:'p1'}},
   AwayCloud:{roundSaveState:()=>receipt},$:s=>nodes.get(s)||null,$$:()=>inputs,esc:String,
   eventPlayer:()=>({name:'Synthetic Player'}),eventPlayerName:()=> 'Synthetic Player',course:()=>({name:'Synthetic Course'}),eventCourseScorecard:()=>({par:Array(18).fill(4),index:Array.from({length:18},(_,i)=>i+1)}),competitionIsOn:()=>false,
   dayScoringMethod:()=>method,writeLocalStore:()=>durable,save:()=>durable,alert:s=>alerts.push(s),confirm:()=>true,
   endScorecardUpdateProtection(){},renderCompletedScorecard:()=>{completed++;},
   renderPlayerExperience:()=>method==='fullCardPlayer'?c.renderFullCardPlayerEntry('p1',1):c.renderFinalScoreEntry('p1',1),
   flushCloudRound:async()=>{uploads++;receipt.pending=true;if(!online)return false;const round=c.scorerStore(1,'p1');receipt.finalisedAt=round._meta?.finalisedAt;receipt.finalScoreConfirmedAt=round._finalScore?.confirmedAt;receipt.pending=false;return true;},
 };
 vm.createContext(c);
 for(const name of ['scoringDayStore','scorerStore','scoreRecord','finalScoreEntry','finalScoreComplete','roundUploadAccepted','uploadEnteredScorecard','renderPendingEnteredScorecard','renderFullCardPlayerEntry','renderFinalScoreEntry'])vm.runInContext(extract(name),c);
 return {c,nodes,receipt,alerts,host,get inputs(){return inputs;},set durable(v){durable=v;},set online(v){online=v;},get uploads(){return uploads;},get completed(){return completed;}};
}
// A failed draft write rolls the input and durable model back.
{
 const p=phone('fullCardPlayer');p.c.renderPlayerExperience();p.durable=false;p.inputs[0].value='7';p.inputs[0].oninput();
 assert.equal(p.inputs[0].value,'4');assert.equal(p.c.store.event.fullCardDrafts.day1.p1.holes[1].gross,'4');assert.match(p.alerts[0],/not saved/);
 await p.nodes.get('#confirmFullPlayerCard').onclick();assert.equal(p.uploads,0);assert.equal(p.completed,0);assert.equal(p.c.scorerStore(1,'p1')._meta,undefined);
}
// Offline full-card submission stays protected and retry closes only after the exact receipt.
{
 const p=phone('fullCardPlayer');p.c.renderPlayerExperience();await p.nodes.get('#confirmFullPlayerCard').onclick();
 assert.equal(p.completed,0);assert(p.c.store.event.fullCardDrafts.day1.p1);assert.match(p.host.innerHTML,/waiting to be accepted online/);
 assert.equal(p.c.roundUploadAccepted(1,'p1'),false);
 p.receipt.pending=false;assert.equal(p.c.roundUploadAccepted(1,'p1'),false,'an earlier acknowledgement is not this final submission');
 p.online=true;await p.nodes.get('#retryEnteredScorecard').onclick();assert.equal(p.completed,1);assert.equal(p.c.store.event.fullCardDrafts.day1.p1,undefined);assert.equal(p.c.roundUploadAccepted(1,'p1'),true);
}
// Final Stableford zero is valid, but a blank, decimal or out-of-range total is not.
{
 const p=phone('finalStableford');p.c.renderPlayerExperience();await p.nodes.get('#saveFinalScore').onclick();assert.equal(p.uploads,0);
 for(const invalid of ['2.5','401','-1']){p.nodes.get('#finalScoreTotal').value=invalid;await p.nodes.get('#saveFinalScore').onclick();}assert.equal(p.uploads,0);
 p.nodes.get('#finalScoreTotal').value='0';await p.nodes.get('#saveFinalScore').onclick();
 assert.equal(p.c.finalScoreComplete(1,'p1'),false);assert.match(p.host.innerHTML,/waiting to be accepted online/);
 p.online=true;await p.nodes.get('#retryEnteredScorecard').onclick();assert.equal(p.c.finalScoreComplete(1,'p1'),true);assert.match(p.host.innerHTML,/Final score saved/);
 p.c.store.event.finalScores={day1:{p1:{total:99,confirmedAt:'obsolete'}}};assert.equal(p.c.finalScoreEntry(1,'p1').total,0,'the accepted score row takes priority over an old plan total');
}
// Gross totals require a positive integer and local failures cannot announce completion.
{
 const p=phone('finalGross');p.c.renderPlayerExperience();p.nodes.get('#finalScoreTotal').value='0';await p.nodes.get('#saveFinalScore').onclick();assert.equal(p.uploads,0);
 p.nodes.get('#finalScoreTotal').value='82';p.durable=false;await p.nodes.get('#saveFinalScore').onclick();assert.equal(p.uploads,0);assert.equal(p.c.scorerStore(1,'p1')._finalScore,undefined);
 p.durable=true;p.online=true;await p.nodes.get('#saveFinalScore').onclick();assert.equal(p.c.finalScoreComplete(1,'p1'),true);assert.equal(p.c.finalScoreEntry(1,'p1').total,82);
}
// A connection switch while uploading must not complete a different event.
{
 const p=phone('fullCardPlayer');p.c.scorerStore(1,'p1')._meta={finalisedAt:'synthetic'};
 let release;p.c.flushCloudRound=()=>new Promise(resolve=>{release=resolve;});const flight=p.c.uploadEnteredScorecard(1,'p1');
 p.c.store.cloud={role:'player',eventId:'other',playerId:'p1'};release(true);assert.equal(await flight,false);assert(p.c.store.event.fullCardDrafts.day1.p1);
}
console.log('Passed: actual player entry handlers, durable-write rollback, offline retention, exact acknowledgement, retry, valid zero, total bounds and connection switches.');
