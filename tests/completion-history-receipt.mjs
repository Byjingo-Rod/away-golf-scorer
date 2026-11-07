import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('  function recordCompletedEventHistory('),end=app.indexOf('\n  function removeRecordedTestEventHistory(',start);assert(start>=0&&end>start);
let profileRecords=0;
const c={store:{pairHistory:{},partnerHistory:{}},recordAwayGolfEventPlayed:()=>{profileRecords++;return false;},isTestEvent:e=>!!e.testMode,competitionIsOn:(id,day,event)=>(event.competitions||[]).includes(id)&&(!event.competitionDays?.[id]||event.competitionDays[id].map(Number).includes(day)),NO_PARTNER_ID:'system-no-partner',pairKey:(a,b)=>[a,b].sort().join('|')};vm.createContext(c);vm.runInContext(app.slice(start,end),c);
const event={publicationId:'one-publication',workspaceId:'one-workspace',days:1,competitions:['fourball'],historyRecordedAt:'shared-cloud-marker',groupSetup:{day1:{groups:[['p1','p2','p3','p4']]}}};
// The closing device counts only after acknowledgement, even though the shared
// accepted payload already carries its history marker.
assert.equal(c.recordCompletedEventHistory(event,true),true);assert.equal(c.store.pairHistory['p1|p2'],1);assert.equal(c.store.partnerHistory['p1|p2'],1);
const once=JSON.stringify(c.store),profilesOnce=profileRecords;
// A later cloud refresh (including an older marker-less representation) and
// another workspace identity must not add the same publication again.
const refreshed={...event,workspaceId:'other-workspace'};delete refreshed.historyRecordedAt;
assert.equal(c.recordCompletedEventHistory(refreshed),false);assert(refreshed.historyRecordedAt);assert.equal(JSON.stringify(c.store),once);assert.equal(profileRecords,profilesOnce);
c.store=JSON.parse(JSON.stringify(c.store));assert.equal(c.recordCompletedEventHistory(refreshed,true),false);assert.equal(JSON.stringify(c.store),once);
// A lost close response recovers once from the durable pending intent, then
// future retries cannot count it again.
c.store={pairHistory:{},partnerHistory:{}};const recovered={...event,publicationId:'lost-response',historyRecordedAt:'accepted-online'};
assert.equal(c.recordCompletedEventHistory(recovered,true),true);assert.equal(c.recordCompletedEventHistory(recovered,true),false);assert.equal(c.store.pairHistory['p1|p2'],1);
// Existing recorded history is adopted without incrementing old counters.
c.store={pairHistory:{'p1|p2':4},partnerHistory:{'p1|p2':2}};const legacy={...event,publicationId:'legacy'};
assert.equal(c.recordCompletedEventHistory(legacy),false);assert.equal(c.recordCompletedEventHistory(legacy,true),false);assert.equal(c.store.pairHistory['p1|p2'],4);
const before=JSON.stringify(c.store);assert.equal(c.recordCompletedEventHistory({...event,publicationId:'test',testMode:true},true),false);assert.equal(JSON.stringify(c.store),before);
console.log('Passed: acknowledged close, polling, workspace changes, restart/backup, lost responses, legacy counters and TEST exclusion record completion history once.');

// Singles-only rounds retain shared-group history without adding 4BBB partners.
c.store={pairHistory:{},partnerHistory:{}};
const singles={...event,publicationId:'singles',competitions:['single']};delete singles.historyRecordedAt;
assert.equal(c.recordCompletedEventHistory(singles,true),true);
assert.equal(c.store.pairHistory['p1|p2'],1);
assert.equal(Object.keys(c.store.partnerHistory).length,0);
const mixed={...singles,publicationId:'mixed',days:2,competitions:['fourball'],competitionDays:{fourball:['2']},groupSetup:{day1:{groups:[['p1','p2','p3','p4']]},day2:{groups:[['p1','p3','p2','p4']]}}};
assert.equal(c.recordCompletedEventHistory(mixed,true),true);
assert.equal(c.store.partnerHistory['p1|p2'],undefined);
assert.equal(c.store.partnerHistory['p1|p3'],1);
console.log('Singles-only and mixed-day partnership history passed.');
