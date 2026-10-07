const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8');
function extract(name){const start=source.indexOf('  function '+name+'(');assert(start>=0,name);const end=source.indexOf('\n  }',start);return source.slice(start,end+4);}
const plain=v=>JSON.parse(JSON.stringify(v));
const nodes=new Map();
function node(key){if(!nodes.has(key))nodes.set(key,{value:'',options:[],listeners:{},classList:{add(){},remove(){}},focus(){},select(){},addEventListener(k,f){this.listeners[k]=f},insertAdjacentHTML(where,html){parse(html)},get innerHTML(){return this.html||''},set innerHTML(html){this.html=html;parse(html)}});return nodes.get(key);}
function parse(html){for(const match of html.matchAll(/<input\b([^>]+)>/g)){const id=match[1].match(/\bid="([^"]+)"/),val=match[1].match(/\bvalue="([^"]*)"/);if(id)node('#'+id[1]).value=val?.[1]||'';}for(const match of html.matchAll(/<select\b([^>]+)>([\s\S]*?)<\/select>/g)){const id=match[1].match(/\bid="([^"]+)"/);if(!id)continue;const n=node('#'+id[1]);n.options=[...match[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(m=>({value:m[1].match(/value="([^"]*)"/)?.[1]||m[2],textContent:m[2],selected:/\bselected\b/.test(m[1]),disabled:/\bdisabled\b/.test(m[1])}));n.value=(n.options.find(o=>o.selected)||n.options[0])?.value||'';}for(const match of html.matchAll(/<textarea\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g))node('#'+match[1]).value=match[2];}
const ctx={console,JSON,Math,Number,Array,Map,Set,Date,store:{courses:[],event:{days:3,competitions:['teamPutts'],competitionDays:{teamPutts:[2]}}},EVENT_TEES:['back','middle','front'],TEE_MARKER_COLOURS:['Blue','White','Yellow'],$:node,$$:selector=>selector==='.teeDetailEntry'?['back','middle','front'].flatMap(tee=>['Colour','Slope','Scratch','Par','Length'].map(field=>node('#'+tee+field))):[],esc:String,gcCourseName:String,teeMarkerColour:tee=>({back:'Blue',middle:'White',front:'Yellow'}[tee]),ensureCourseData(){},renderCoursesAdmin(){},writeLocalStore(){},confirm:()=>true,alert:m=>{ctx.lastAlert=m},save:()=>{ctx.saved=plain(ctx.store);return true},course:id=>ctx.store.courses.find(c=>c.id===id),version:c=>c?.versions?.[0]};
vm.createContext(ctx);
for(const name of ['eventDays','competitionDays','competitionIsOn','courseDistanceUnit','courseDistanceAbbrev','courseHoleDistance','courseInputDistance','recordCourseDistances','courseDistanceTotal','cloneCourseCard','ensureTeeScorecards','courseScorecard','validateCourseScorecard','courseDetail','scoreEntryControls','scoreEntriesMismatch'])vm.runInContext(extract(name),ctx);
ctx.scoreEntered=value=>value!==''&&value!=null;
let card={};ctx.recordCourseDistances(card,[300,400,150,'',0], 'yards','yards');assert.deepEqual(card.metres,[274,366,137,'','']);assert.deepEqual(card.yards,[300,400,150,'','']);assert.equal(ctx.courseHoleDistance(card,0),300);assert.equal(ctx.courseDistanceAbbrev(card),'yd');
ctx.recordCourseDistances(card,card.yards,'yards','metres');assert.equal(ctx.courseHoleDistance(card,0),274);assert.equal(ctx.courseInputDistance(card,0),300);assert.equal(card.distanceUnit,'metres');
const copied=ctx.cloneCourseCard(card,'back');copied.yards[0]=999;assert.equal(card.yards[0],300);assert.equal(copied.distanceInputUnit,'yards');
let legacy={metres:[400,200]};assert.equal(ctx.courseHoleDistance(legacy,0),400);assert.equal(ctx.courseDistanceUnit(legacy),'metres');assert.equal(ctx.courseInputDistance(legacy,0,'yards'),437);
// Actual editor handlers with a minimal DOM surface: unit switch, entry, totals,
// save/reopen, change output only, new tee and complete-card copy.
const c={id:'vietnam-test',name:'Vietnam Test GC',teeDetails:Object.fromEntries(ctx.EVENT_TEES.map(t=>[t,{colour:ctx.teeMarkerColour(t)}])),teeScorecards:{middle:{tee:'middle',par:Array(18).fill(4),index:Array.from({length:18},(_,i)=>i+1),metres:Array(18).fill(400)}}};ctx.store.courses=[c];
ctx.courseDetail(c.id,'middle');let change=node('#courseDistanceInput');change.value='yards';change.onchange({target:change});assert.equal(node('#scMet0').value,437);
for(let i=0;i<18;i++)node('#scMet'+i).value='300';change=node('#courseDistanceSave');change.value='yards';change.onchange({target:change});assert.match(node('#scorecardTotals').innerHTML,/5400 yd/);
node('#saveCourseModal').onclick();assert.equal(ctx.lastAlert,undefined);assert.deepEqual(plain(c.teeScorecards.middle.metres),Array(18).fill(274));assert.deepEqual(plain(c.teeScorecards.middle.yards),Array(18).fill(300));assert.equal(c.teeDetails.middle.length,4932);
ctx.store=plain(ctx.saved);ctx.store.courses[0].teeScorecards.front=ctx.cloneCourseCard(ctx.store.courses[0].teeScorecards.middle,'front');ctx.courseDetail(c.id,'middle');assert.equal(node('#scMet0').value,'300');assert.equal(node('#courseDistanceInput').value,'yards');assert.equal(node('#courseDistanceSave').value,'yards');assert.match(node('#scorecardTotals').innerHTML,/5400 yd/);
node('#saveCourseModal').onclick();assert.equal(ctx.store.courses[0].teeDetails.front.length,4932);
change=node('#courseDistanceSave');change.value='metres';change.onchange({target:change});assert.match(node('#scorecardTotals').innerHTML,/4932 m/);node('#saveCourseModal').onclick();
ctx.courseDetail(c.id,'middle');assert.equal(node('#scMet0').value,'300');node('#saveCourseModal').onclick();assert.equal(ctx.store.courses[0].teeScorecards.middle.metres[0],274);assert.equal(ctx.store.courses[0].teeScorecards.middle.yards[0],300);
change=node('#scorecardTeeSelect');change.value='back';change.onchange({target:change});assert.equal(node('#courseDistanceInput').value,'yards');assert.equal(node('#scMet0').value,'');node('#copyScorecardFrom').value='middle';node('#copyScorecardButton').onclick();assert.equal(ctx.store.courses[0].teeScorecards.back.metres[0],274);assert.equal(ctx.store.courses[0].teeScorecards.back.yards[0],300);assert.equal(node('#scMet0').value,'300');
// Real scoring-control markup generators from the phone renderer.
const start=source.indexOf('    const stepper =',source.indexOf('  function renderHoleScoring'));
const end=source.indexOf('    const timeText =',start);
vm.runInContext(source.slice(start,end)+'\n globalThis.stepper=stepper;globalThis.pickup=pickup;',ctx);
ctx.store.event={days:3,competitions:['teamPutts'],competitionDays:{teamPutts:[2]}};
for(const day of [1,2,3])for(const section of ['official','self']){
 const on=ctx.competitionIsOn('teamPutts',day);const html=ctx.scoreEntryControls(on,section,{gross:'P',putts:''},4,ctx.stepper,ctx.pickup);
 assert.match(html,new RegExp('data-pickup="'+section+'Gross"'));assert.match(html,/picked/);
 if(day===2){assert.match(html,/Putts/);assert(!html.includes('noPutting'));assert.match(html,/PICK-UP RECORDED/)}else{assert(!html.includes('Putts'));assert.match(html,/noPutting/);assert.match(html,/✓ PICK-UP \(P\)/);assert.equal((html.match(/data-pickup=/g)||[]).length,1)}
}
ctx.store.event.competitions=[];assert.equal(ctx.competitionIsOn('teamPutts',2),false);
assert(ctx.scoreEntriesMismatch({gross:4},{gross:5},false));assert(!ctx.scoreEntriesMismatch({gross:4,putts:2},{gross:4,putts:3},false));assert(ctx.scoreEntriesMismatch({gross:4,putts:2},{gross:4,putts:3},true));assert(!ctx.scoreEntriesMismatch({gross:4},{gross:5},true));assert(!ctx.scoreEntriesMismatch({gross:'P'},{gross:'p'},false));
assert.match(source,/courseDistanceUnit\(v\)\.toUpperCase\(\)/);assert(!source.includes('<small>METRES</small>'));
console.log('Passed: day-specific putting/pickup layout, stroke-only mismatches, legacy metre cards, retained yards, rounded conversion, editor totals/save/reopen, repeated-save stability, new tee/copy metadata and phone/NTP unit labels.');
