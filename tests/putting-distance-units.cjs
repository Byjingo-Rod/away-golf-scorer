const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8');
function extract(name){const start=source.indexOf('  function '+name+'(');assert(start>=0,name);const end=source.indexOf('\n  }',start);return source.slice(start,end+4);}
const plain=v=>JSON.parse(JSON.stringify(v));
const nodes=new Map();
function node(key){if(!nodes.has(key))nodes.set(key,{value:'',parentElement:{set innerHTML(html){parse(html)}},options:[],listeners:{},classList:{add(){},remove(){}},focus(){},select(){},addEventListener(k,f){this.listeners[k]=f},insertAdjacentHTML(where,html){parse(html)},get innerHTML(){return this.html||''},set innerHTML(html){this.html=html;parse(html)}});return nodes.get(key);}
function parse(html){for(const match of html.matchAll(/<input\b([^>]+)>/g)){const id=match[1].match(/\bid="([^"]+)"/),val=match[1].match(/\bvalue="([^"]*)"/);if(id)node('#'+id[1]).value=val?.[1]||'';}for(const match of html.matchAll(/<select\b([^>]+)>([\s\S]*?)<\/select>/g)){const id=match[1].match(/\bid="([^"]+)"/);if(!id)continue;const n=node('#'+id[1]);n.options=[...match[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(m=>({value:m[1].match(/value="([^"]*)"/)?.[1]??m[2],textContent:m[2],selected:/\bselected\b/.test(m[1]),disabled:/\bdisabled\b/.test(m[1])}));n.value=(n.options.find(o=>o.selected)||n.options[0])?.value||'';}for(const match of html.matchAll(/<textarea\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g))node('#'+match[1]).value=match[2];}
const draftStorage=new Map();
const localStorage={getItem:k=>draftStorage.get(k)||null,setItem:(k,v)=>draftStorage.set(k,v),removeItem:k=>draftStorage.delete(k)};
const ctx={localStorage,window:{},console,JSON,Math,Number,Array,Map,Set,Date,store:{courses:[],event:{days:3,competitions:['teamPutts'],competitionDays:{teamPutts:[2]}}},EVENT_TEES:['back','middle','front'],TEE_MARKER_COLOURS:['Blue','White','Yellow'],$:node,$$:selector=>selector==='.teeDetailEntry'?['back','middle','front'].flatMap(tee=>['Colour','Slope','Scratch','Par','Length'].map(field=>node('#'+tee+field))):[],esc:String,gcCourseName:String,teeMarkerColour:tee=>({back:'Blue',middle:'White',front:'Yellow'}[tee]),ensureCourseData(){},renderCoursesAdmin(){},writeLocalStore(){},confirm:()=>true,alert:m=>{ctx.lastAlert=m},save:()=>{ctx.saved=plain(ctx.store);return true},course:id=>ctx.store.courses.find(c=>c.id===id),version:c=>c?.versions?.[0]};
ctx.queueMasterCourse=()=>{};ctx.queueMasterCountry=()=>{};vm.createContext(ctx);vm.runInContext(fs.readFileSync('course-locations.js','utf8'),ctx);ctx.GolfCourseLocations=ctx.window.GolfCourseLocations;vm.runInContext('const COURSE_AU_STATES = ["ACT","NSW","NT","QLD","SA","TAS","VIC","WA"];',ctx);
for(const name of ['cleanCourseLocation','courseCountryList','canonicalCourseCountry','addCourseCountry','courseLocationMatches','courseLocationIssues','courseRegionList','courseRegionField','bindCourseRegion','bindCourseProvince','courseLocationFields','courseStateField','eventDays','competitionDays','competitionIsOn','courseDistanceUnit','courseDistanceAbbrev','courseHoleDistance','courseInputDistance','recordCourseDistances','courseDistanceTotal','cloneCourseCard','ensureTeeScorecards','courseScorecard','validateCourseScorecard','courseDetail','scoreEntryControls','scoreEntriesMismatch'])vm.runInContext(extract(name),ctx);
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
change=node('#scorecardTeeSelect');change.value='back';change.onchange({target:change});assert.equal(node('#courseDistanceInput').value,'yards');assert.equal(node('#scMet0').value,'');node('#copyScorecardFrom').value='middle';node('#copyScorecardButton').onclick();node('#saveCourseModal').onclick();assert.equal(ctx.store.courses[0].teeScorecards.back.metres[0],274);assert.equal(ctx.store.courses[0].teeScorecards.back.yards[0],300);assert.equal(node('#scMet0').value,'300');
// Column copy uses the destination's current entries and preserves unselected fields.
ctx.store.courses[0].teeScorecards.back.index=Array.from({length:18},(_,i)=>`${i+1}/${i+19}`);
for(const destination of ['middle','front']){
 ctx.courseDetail(c.id,destination);
 const original=plain(ctx.store.courses[0].teeScorecards[destination]);
 const ratings=plain(ctx.store.courses[0].teeDetails[destination]);
 node('#copyScorecardFrom').value='back';node('#copyScorecardMode').value='index';node('#copyScorecardButton').onclick();
 node('#saveCourseModal').onclick();
 const result=ctx.store.courses[0].teeScorecards[destination];
 assert.deepEqual(plain(result.index),plain(ctx.store.courses[0].teeScorecards.back.index));
 for(const field of ['par','metres','yards','distanceUnit','distanceInputUnit'])assert.deepEqual(plain(result[field]),plain(original[field]),field);
 for(const field of ['slope','scratch','colour'])assert.equal(ctx.store.courses[0].teeDetails[destination][field],ratings[field]);
}
ctx.courseDetail(c.id,'middle');node('#scMet0').value='333';node('#mcnotes').value='Unsaved note kept';
node('#copyScorecardFrom').value='back';node('#copyScorecardMode').value='index';node('#copyScorecardButton').onclick();
assert.equal(node('#scMet0').value,'333');assert.equal(node('#mcnotes').value,'Unsaved note kept');
assert.equal(JSON.parse(localStorage.getItem('awayGolfCourseDraft:'+c.id)).course.teeScorecards.middle.metres[0],304);
node('#saveCourseModal').onclick();ctx.store=plain(ctx.saved);ctx.courseDetail(c.id,'middle');
assert.equal(node('#scIdx0').value,'1/19');assert.equal(node('#scMet0').value,'333');
const retainedIndex=plain(ctx.store.courses[0].teeScorecards.middle.index);
node('#copyScorecardFrom').value='back';node('#copyScorecardMode').value='par';node('#copyScorecardButton').onclick();
assert.deepEqual(plain(ctx.store.courses[0].teeScorecards.middle.index),retainedIndex);assert.equal(node('#scMet0').value,'333');
node('#copyScorecardFrom').value='back';node('#copyScorecardMode').value='metres';node('#copyScorecardButton').onclick();
assert.equal(node('#scMet0').value,'300');assert.deepEqual(plain(ctx.store.courses[0].teeScorecards.middle.index),retainedIndex);
console.log('Passed: Blue indexes including secondary strokes copied to White/Yellow without changing par, lengths, units or ratings; unsaved edits retained; save/reopen; Par-only and Length-only copies.');
// Actual location editor handlers: mandatory new-course location, country addition,
// state switching, persistence and case-insensitive country identity.
localStorage.removeItem('awayGolfCourseDraft:'+c.id);
let edited=ctx.store.courses[0];edited.locationRequired=true;
ctx.courseDetail(edited.id,'middle');ctx.lastAlert=undefined;node('#mcregion').value='';node('#mcstate').value='';node('#saveCourseModal').onclick();assert.match(ctx.lastAlert,/Region \/ Area/);assert.match(ctx.lastAlert,/Australian state/);
ctx.lastAlert=undefined;node('#mcregion').value=' Hunter   Valley ';node('#mcstate').value='NSW';node('#saveCourseModal').onclick();assert.equal(ctx.lastAlert,undefined);assert.equal(edited.region,'Hunter Valley');assert.equal(edited.state,'NSW');assert.equal(edited.country,'Australia');assert.equal(edited.locationRequired,undefined);
ctx.prompt=()=> ' Japan ';change=node('#mccountry');change.value='__add_country__';change.onchange({target:change});assert.equal(change.value,'Japan');assert.equal(node('#mcstate').value,'');assert.equal(node('#mcstateLabel').textContent,'State / Province (optional)');node('#mcregion').value='Kansai';node('#saveCourseModal').onclick();assert(ctx.store.courseCountries.includes('Japan'));
assert.equal(ctx.addCourseCountry(' jAPAN '),'Japan');assert.equal(ctx.store.courseCountries.filter(v=>v.toLowerCase()==='japan').length,1);
ctx.store=plain(ctx.saved);ctx.courseDetail(edited.id,'middle');assert.equal(node('#mccountry').value,'Japan');assert.equal(node('#mcregion').value,'Kansai');assert(ctx.courseCountryList().includes('Japan'));
assert(ctx.courseLocationMatches({country:' Australia ',state:'NSW',region:'Hunter Valley'},{country:'Australia',state:'nsw',region:'hunter valley'}));assert(!ctx.courseLocationMatches({country:'Vietnam',region:'Da Nang'},{country:'Japan'}));assert(ctx.courseLocationMatches({name:'Legacy'},{country:'Australia'}));
assert.equal(ctx.courseLocationIssues({country:'Vietnam',region:'Da Nang'}).length,0);assert.equal(ctx.courseLocationIssues({country:'Australia',region:'Hunter Valley',state:'NSW'}).length,0);assert.equal(ctx.courseLocationIssues({country:'Australia',region:'Hunter Valley',state:'INVALID'}).length,1);
ctx.addCourseCountry('Vietnam');ctx.addCourseCountry(' vietnam ');assert.equal(ctx.store.courseCountries.filter(v=>v.toLowerCase()==='vietnam').length,1);
ctx.renderMasterCoursePanel=()=>{};ctx.getMasterCourseLibrary=()=>null;ctx.queueMasterCourse=()=>{};ctx.queueMasterCountry=()=>{};ctx.wizardReturnStep=null;vm.runInContext('let courseLocationFilter = {country:"",state:"",region:""};',ctx);
for(const name of ['renderCourseLocationFilters','renderCoursesAdmin'])vm.runInContext(extract(name),ctx);
const template=plain(ctx.store.courses[0]);ctx.store.courses=[{...plain(template),id:'au1',name:'Hunter Course',country:'Australia',state:'NSW',region:'Hunter Valley'},{...plain(template),id:'au2',name:'Sydney Course',country:'Australia',state:'NSW',region:'Sydney'},{...plain(template),id:'vn1',name:'Vietnam Course',country:'Vietnam',state:'',region:'Da Nang'}];
ctx.renderCoursesAdmin();assert.match(node('#courseAdminList').innerHTML,/Hunter Course/);assert.match(node('#courseAdminList').innerHTML,/Vietnam Course/);
change=node('#courseCountryFilter');change.value='Australia';change.onchange({target:change});assert(!node('#courseAdminList').innerHTML.includes('Vietnam Course'));assert(node('#courseStateFilter').options.some(o=>o.value==='NSW'));
change=node('#courseRegionFilter');change.value='Hunter Valley';change.onchange({target:change});assert.match(node('#courseAdminList').innerHTML,/Hunter Course/);assert(!node('#courseAdminList').innerHTML.includes('Sydney Course'));
node('#courseSearchMain').value='missing';ctx.renderCoursesAdmin();assert.match(node('#courseAdminList').innerHTML,/No courses match/);node('#clearCourseFilters').onclick();assert.match(node('#courseAdminList').innerHTML,/Vietnam Course/);assert.equal(node('#courseSearchMain').value,'');
change=node('#courseCountryFilter');change.value='Vietnam';change.onchange({target:change});assert.equal(node('#courseRegionFilter').value,'');assert(node('#courseRegionFilter').options.some(o=>o.value==='Da Nang'));
ctx.prompt=()=> ' Korea ';node('#adminAddCountry').onclick();assert(ctx.store.courseCountries.includes('Korea'));ctx.store=plain(ctx.saved);assert(ctx.courseCountryList().includes('Korea'));
console.log('Passed: new-course location validation, country addition/case deduplication/save/reopen, Australia states, optional overseas province, cascading country/state/region filters, name search and clear filters.');
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

// Partial draft recovery and completed master isolation, using the actual editor handlers.
const masterBefore=plain(ctx.store.courses[0]);
const draftId=masterBefore.id;
ctx.courseDetail(draftId,'middle');
node('#scMet0').value='';node('#scIdx1').value='';node('#mcnotes').value='Resume after my break';
node('#modalContent').oninput();
assert.deepEqual(plain(ctx.store.courses[0]),masterBefore,'autosave must not modify accepted master');
let partial=JSON.parse(localStorage.getItem('awayGolfCourseDraft:'+draftId));
assert.equal(partial.course.teeScorecards.middle.metres[0],'');
assert.equal(partial.course.teeScorecards.middle.index[1],'');
node('#closeModal').onclick();ctx.courseDetail(draftId,'middle');
assert.equal(node('#scMet0').value,'');assert.equal(node('#scIdx1').value,'');assert.equal(node('#mcnotes').value,'Resume after my break');
ctx.lastAlert=undefined;node('#saveCourseModal').onclick();assert.match(ctx.lastAlert,/cannot be saved/);
assert.deepEqual(plain(ctx.store.courses[0]),masterBefore,'invalid completion must not replace master');
const realSet=localStorage.setItem;localStorage.setItem=()=>{throw Error('Storage full');};
node('#mcnotes').value='Unsaved after storage failure';node('#saveCourseDraft').onclick();
assert.match(node('#courseDraftStatus').textContent,/could not be saved/);localStorage.setItem=realSet;
node('#scMet0').value=String(ctx.courseInputDistance(masterBefore.teeScorecards.middle,0));node('#scIdx1').value=masterBefore.teeScorecards.middle.index[1];
ctx.lastAlert=undefined;node('#saveCourseModal').onclick();assert.equal(ctx.lastAlert,undefined);assert.equal(localStorage.getItem('awayGolfCourseDraft:'+draftId),null);
assert.equal(ctx.store.courses[0].notes,'Unsaved after storage failure');
console.log('Passed: incomplete autosave, close/reopen recovery, accepted master isolation, validation, storage failure reporting, completed save clears draft.');

// A completed active tee must not publish another unfinished tee from its draft.
const completedMaster=plain(ctx.store.courses[0]);ctx.courseDetail(draftId,'front');node('#scMet0').value='';node('#saveCourseDraft').onclick();
let teeSelect=node('#scorecardTeeSelect');teeSelect.value='middle';teeSelect.onchange({target:teeSelect});ctx.lastAlert=undefined;node('#saveCourseModal').onclick();
assert.match(ctx.lastAlert,/Yellow.*distance/);assert.deepEqual(plain(ctx.store.courses[0]),completedMaster);
assert.equal(JSON.parse(localStorage.getItem('awayGolfCourseDraft:'+draftId)).course.teeScorecards.front.metres[0],'');
console.log('Passed: completion checks every entered tee and retains unfinished tee drafts.');

vm.runInContext(extract('retainCourseDraftBeforeCloud'),ctx);
ctx.writeLocalStore=()=>true;
const rawDraft=localStorage.getItem('awayGolfCourseDraft:'+draftId);
assert(ctx.retainCourseDraftBeforeCloud(draftId));assert.equal(localStorage.getItem('awayGolfCourseDraft:'+draftId),null);
assert.deepEqual(plain(ctx.store.replacedCourseDrafts[draftId].draft),JSON.parse(rawDraft));
ctx.courseDetail(draftId,'front');assert.equal(node('#scMet0').value,String(ctx.courseInputDistance(ctx.store.courses[0].teeScorecards.front,0)));
node('#scMet0').value='';node('#saveCourseDraft').onclick();ctx.writeLocalStore=()=>false;
assert.equal(ctx.retainCourseDraftBeforeCloud(draftId),false);assert(localStorage.getItem('awayGolfCourseDraft:'+draftId),'failed retention must keep original draft');
console.log('Passed: selecting a cloud copy retains the old draft in organiser backup, clears stale editor recovery, and refuses unsafe retention.');
