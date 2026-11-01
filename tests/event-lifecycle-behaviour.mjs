import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function extract(name){const start=src.search(new RegExp('  (?:async )?function '+name+'\\('));assert(start>=0,name);const rest=src.slice(start+3),end=rest.search(/\n  (?:async )?function /);return src.slice(start,end<0?src.length:start+3+end);}
// Execute the real Ambrose finish/upload handlers on player and organiser devices.
for (const role of ["player","organiser"]) {
 const nodes=new Map(),host={};Object.defineProperty(host,'innerHTML',{get(){return this.html},set(html){this.html=html;for(const m of html.matchAll(/\bid="([^"]+)"/g))nodes.set('#'+m[1],{disabled:false});}});nodes.set('#playerExperience',host);
 const rounds={p1:{},p2:{}};for(let h=1;h<=18;h++)for(const p of ['p1','p2'])rounds[p][h]={self:{gross:4},ambrose:{drivePlayerId:'p1'}};
 let durable=false,online=false;const uploaded=[],receipt={acknowledged:true,finalisedAt:'old'};
 const c={store:{event:{days:1,course1:'c',playerHolePos:17,ambroseMinimumDrives:0,scoring:{day1:rounds}},cloud:{role,playerId:'p1',eventId:'synthetic'}},
 $:s=>nodes.get(s)||{},$$:()=>[],esc:String,requestRoundWakeLock(){},playerGroupContext:()=>({groupIndex:0,setup:{}}),ambroseRoles:()=>({scorerId:'p1',markerId:'p2',team:['p1','p2','p3','p4']}),
 course:()=>({}),eventCourseScorecard:()=>({par:Array(18).fill(4),index:Array.from({length:18},(_,i)=>i+1)}),groupStartingHole:()=>1,scoreSequence:()=>Array.from({length:18},(_,i)=>i+1),
 ambroseHoleAgreement:()=>({complete:true,scorerDone:true,markerDone:true,mismatch:false}),ambroseEntry:(d,p,h)=>rounds[p][h],scorerStore:(d,p)=>rounds[p],
 ntpHolesFor:()=>[],ambroseTeamHandicap:()=>10,ambroseDriveCounts:()=>({p1:5,p2:5,p3:4,p4:4}),scoreEntered:v=>v!=null,eventPlayer:p=>({name:p}),courseHoleDistance:()=>300,courseDistanceUnit:()=> 'm',
 writeLocalStore:()=>durable,dayScoringMethod:()=> 'holeByHole',setCloudMessage(){},renderPlayerExperience(){},renderHome(){},enableHoleSwipe(){},ambroseTeamComplete:()=>true,confirm:()=>true,alert(){},
 AwayCloud:{roundSaveState:()=>receipt},flushCloudRound:async(d,p)=>{uploaded.push(p);if(!online)return false;receipt.finalisedAt=rounds[p]._meta.finalisedAt;return true;},
 };
 vm.createContext(c);for(const n of ['roundUploadAccepted','uploadEnteredScorecard','ambroseTeamAccepted','renderAmbroseScoring'])vm.runInContext(extract(n),c);
 c.renderAmbroseScoring('p1',1);await nodes.get('#nextHole').onclick();assert.equal(uploaded.length,0);assert.equal(rounds.p1._meta?.finalisedAt,undefined);
 durable=true;await nodes.get('#nextHole').onclick();assert.equal(c.store.event.playerRoundMode,'ambrosePending');assert.equal(rounds.p2._meta,undefined);assert.deepEqual(uploaded,['p1']);assert.equal(c.roundUploadAccepted(1,'p1'),false);
 assert.equal(c.ambroseTeamAccepted(1,0),false);online=true;assert.equal(await c.uploadEnteredScorecard(1,'p1'),true);assert.equal(c.store.event.playerRoundMode,'completed');assert.equal(c.ambroseTeamAccepted(1,0),false);
 rounds.p2._meta={finalisedAt:'other-phone-accepted'};assert.equal(c.ambroseTeamAccepted(1,0),true);
}
// Close intent persists, but complete status and history require the exact receipt.
{
 let durable=false,online=false,calls=0,history=0;const alerts=[];
 const event={days:1,status:'locked',workspaceId:'w'},connection={eventId:'synthetic',role:'organiser'};
 const c={store:{event,cloud:connection},GolfSafeCloud:{saveHealth:()=>({})},isGuestOrganiser:()=>false,syncCloudNow:async()=>({event:{revision:7},scores:[{day:1,scorer_player_id:'p1',revision:3}]}),
 eventDayComplete:()=>true,leaderboardDefinitions:()=>[],summaryCompetitionResult:()=>({complete:true}),confirm:()=>true,buildFinalPlayerMessages:()=>({}),recordCompletedEventHistory(){if(!event.historyRecordedAt){history++;event.historyRecordedAt='recorded';}},
 writeLocalStore:()=>durable,persistStore:()=>durable,cloudPayload:e=>({event:e,players:[],courses:[]}),setCloudMessage(){},renderLeaderboard(){},renderHome(){},alert:m=>alerts.push(m),
 AwayCloud:{confirmEvent:async(id,doc,rev,revisions)=>{calls++;assert.equal(rev,7);assert.deepEqual(JSON.parse(JSON.stringify(revisions)),{'1:p1':3});if(!online)throw Error('offline');return {saved_data:{...doc,event:{...doc.event,finalResults:{...doc.event.finalResults,cloudAcceptedAt:'accepted'}}},revision:8};}},
 };
 vm.createContext(c);vm.runInContext(extract('confirmResultsAndCloseEvent'),c);
 await c.confirmResultsAndCloseEvent();assert.equal(calls,0);assert.equal(event.finalResults,undefined);assert.equal(history,0);
 durable=true;await c.confirmResultsAndCloseEvent();const intent=c.store.pendingEventClose.confirmedAt;assert.equal(calls,1);assert.equal(event.finalResults,undefined);assert.equal(event.status,'locked');assert.equal(history,0);
 online=true;await c.confirmResultsAndCloseEvent();assert.equal(event.finalResults.confirmedAt,intent);assert.equal(event.status,'complete');assert.equal(history,1);assert.equal(c.store.pendingEventClose,undefined);
 assert(!alerts.some(m=>m.includes('messages are now available')));
}
// No eligible winner is completed play and must not create an award.
{
 const c={store:{event:{days:1}},eventDayComplete:()=>true,eventDays:()=>[1],calculateLeaderboard:()=>[{id:'team1',disqualified:true,thru:18,target:18}],yellowBallResultsReady:()=>true};
 vm.createContext(c);for(const n of ['leaderboardComplete','summaryCompetitionResult'])vm.runInContext(extract(n),c);
 for(const type of ['ambrose','scratch','scratchaggregate']){const r=c.summaryCompetitionResult({type,day:1});assert.equal(r.complete,true);assert.equal(r.awardable,false);assert.match(r.text,/No eligible winner/);}
 c.calculateLeaderboard=()=>[];assert.equal(c.summaryCompetitionResult({type:'scratch',day:1}).complete,true);
}
// Ambrose NTP completion uses the accepted team round, not absent individual cards.
{
 const c={store:{event:{}},eventDayComplete:()=>true,eventDays:()=>[1],ambroseIsOn:()=>true};vm.createContext(c);vm.runInContext(extract('leaderboardComplete'),c);assert.equal(c.leaderboardComplete({type:'ntp',day:1},[]),true);
}
// Final totals count as started for both event and team locks.
{
 const c={store:{event:{groupSetup:{day1:{groups:[['p1']]}},scoring:{day1:{p1:{_finalScore:{kind:'gross',total:82,confirmedAt:'accepted'}}}}}},scoreEntered:v=>v!==''&&v!=null,NO_PARTNER_ID:'system-no-partner'};
 vm.createContext(c);for(const n of ['firstDayScoreEntry','groupHasScoreEntries'])vm.runInContext(extract(n),c);
 assert.equal(c.firstDayScoreEntry(1).finalTotal,true);assert.equal(c.groupHasScoreEntries(1,0).finalTotal,true);assert.equal(c.firstDayScoreEntry(2),null);
}
// Repeated clicks cannot overlap creation; a durable operation ID survives retries.
{
 let creates=0,durable=false,release;const c={store:{event:{name:'Synthetic',locked:true}},uid:()=> 'durable-publication',setCloudMessage(){},persistStore:()=>durable,writeLocalStore:()=>true,cloudPayload:()=>({event:c.store.event,courses:[]}),cloudPlayerRows:()=>[],
 AwayCloud:{createEvent:async()=>{creates++;await new Promise(r=>{release=r;});return {event_id:'same',join_code:'SAME01'};},updateEvent:async()=>({})},rememberOrganiserWorkspace:async()=>{},rememberPublishedEvent(){},watchCloudEvent(){},renderCloudPanel(){},alert(){}};
 vm.createContext(c);vm.runInContext('let publicationFlight=false;'+extract('publishCloudEvent'),c);
 assert.equal(await c.publishCloudEvent(),false);assert.equal(creates,0);assert.equal(c.store.event.publicationId,'durable-publication');durable=true;
 const first=c.publishCloudEvent();await Promise.resolve();assert.equal(await c.publishCloudEvent(),false);release();assert.equal(await first,true);assert.equal(creates,1);
}
console.log('Passed: Ambrose durable/offline/exact receipts, separate marker submission, close failure/retry/history, no-winner results, final-total locks and repeat publication.');
