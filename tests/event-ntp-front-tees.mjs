import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const block = (start,end) => app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
const ntpCount = vm.runInNewContext(block('  function ntpCount(', '  const gcCourseName')+';ntpCount');
const event={days:5,competitions:['ntp'],ntpCounts:{day5:2},ntpDay2Count:2};
assert.deepEqual([1,2,3,4,5].map(day=>ntpCount(day,event)),[1,1,1,1,2]);
assert.equal(ntpCount(2,{days:2}),2);
assert.equal(ntpCount(2,{days:2,ntpDay2Count:1}),1);
assert.equal(ntpCount(2,{...event,ntpCounts:{day2:2,day5:2}}),2);
// Exercise the actual planning page: opening a saved draft trims an implicit
// second Day 2 hole, retains the requested final-day pair, and emits six cards.
const body={innerHTML:''};
const context={W:{event,competitions:new Set(['ntp'])},ntpCount,
 $:()=>body,$$:()=>[],esc:v=>String(v??''),course:()=>({name:'Vietnam course'}),
 eventCourseScorecard:()=>({par:Array.from({length:18},(_,i)=>[1,7,11,13].includes(i)?3:4),index:Array.from({length:18},(_,i)=>i+1)}),
 courseHoleDistance:()=>150,courseDistanceAbbrev:()=> 'm',selectedEventTee:()=> 'middle',
 competitionDays:()=>[1,2,3,4,5],startMethodFor:()=> 'single',startHolesFor:()=>[1]};
for(let d=1;d<=5;d++)event['course'+d]='course'+d;
event.ntpSelections={day2:[12,2]};event.ntpSelectionSources={day2:'course2|middle'};
vm.createContext(context);vm.runInContext(block('  function renderStep5()','  function renderStep6()'),context);context.renderStep5();
assert.deepEqual(Array.from(event.ntpSelections.day2),[12]);
assert.deepEqual([1,2,3,4,5].map(d=>event.ntpSelections['day'+d].length),[1,1,1,1,2]);
assert.equal((body.innerHTML.match(/class="ntpSelectCard"/g)||[]).length,6);
// Final-NTP jackpot only: five unclaimed four-ball prizes reach the last slot.
event.ntpJackpot=true;event.ntpJackpotMode='final';event.benefits={ntp:{balls:4}};
const jackpotContext={store:{event},ntpHolesInPlayingOrder:day=>event.ntpSelections['day'+day],currentNtpHolder:()=>null,eventDayComplete:()=>true};
vm.createContext(jackpotContext);vm.runInContext(block('  function ntpEventSlots()','  function ntpPrizeBalls('),jackpotContext);
const slots=jackpotContext.ntpEventSlots(),last=slots.at(-1);
assert.equal(last.day,5);assert.equal(slots.length,6);
assert.equal(jackpotContext.ntpJackpotState(last.day,last.hole).prize,24);
for(const s of slots.slice(0,-1))assert.equal(jackpotContext.ntpJackpotState(s.day,s.hole).carried,0);
const setFront=vm.runInNewContext(block('  function setEventFrontTee(', '  function ensureEventTeePlanning(')+';setEventFrontTee');
const tees={days:5,enabledTeesByDay:{day3:['back','middle','front']},teeHandicaps:{player:{day3:{front:19}}}};
setFront(tees,1,true,'course');assert.equal(tees.enabledTeesByDay.day1.length,3);assert.equal(tees.enabledTeesByDay.day2,undefined);
setFront(tees,1,true,'all');for(let d=1;d<=5;d++)assert.equal(tees.enabledTeesByDay['day'+d].length,3);
setFront(tees,3,false,'all');assert.equal(tees.enabledTeesByDay.day3.length,2);assert.equal(tees.enabledTeesByDay.day4.length,3);
setFront(tees,1,false,'all');for(let d=1;d<=5;d++)assert.equal(tees.enabledTeesByDay['day'+d].length,2);
assert.equal(tees.teeHandicaps.player.day3.front,19);
console.log('Five-day NTP counts, saved-draft hole correction, final-slot jackpot and all-course/per-course Front tee checks passed.');
