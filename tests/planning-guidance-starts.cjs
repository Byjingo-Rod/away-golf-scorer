const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||'app.js','utf8');
const ctx={store:{event:{},players:[]},NO_PARTNER_ID:'np',esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'),firstDayScoreEntry:()=>false};vm.createContext(ctx);
function load(a,b){vm.runInContext(source.slice(source.indexOf('  function '+a+'('),source.indexOf('  function '+b+'(')),ctx);}
load('playerIdentityLabel','ntpNameLineCount');
const original={id:'original',name:'Rod Ruston',golfLink:'12345678'},demo={id:'demo1',name:'Rod Ruston',demoBatch:'demo',demoCode:'D01'};
const a={id:'demo2',name:'Ross Smith',demoBatch:'demo',demoCode:'D02'},b={id:'demo3',name:'Ross Smith',demoBatch:'demo',demoCode:'D03'};
ctx.store.players=[original,demo,a,b];
assert.equal(ctx.playerIdentityLabel(original),'Rod Ruston');assert.equal(ctx.playerIdentityLabel(demo),'Rod Ruston');assert.notEqual(ctx.playerIdentityLabel(a),ctx.playerIdentityLabel(b));assert(ctx.playerIdentityHtml(a).includes('<span class="playerIdentitySuffix">'));
assert(!ctx.playerIdentityHtml(demo).includes('Suffix'));
ctx.store.event={confirmed:['original','demo1']};assert(ctx.playerIdentityLabel(original).includes('G/L 5678'));assert(ctx.playerIdentityLabel(demo).includes('No G/L Number'));ctx.store.event={};
load('startMethodFor','groupStartingHole');load('defaultStarts','dayFieldIds');
for(let n=1;n<=36;n++){
 const starts=Array.from(ctx.defaultStarts(Array(n).fill([]),'shotgun'));
 assert.equal(new Set(starts.slice(0,Math.min(n,18))).size,Math.min(n,18));
 assert(starts.every(h=>h>=1&&h<=18));
}
const groups=Array(13).fill([]),legacy=[1,3,5,7,9,10,12,14,16,18,3,5,7];ctx.store.event={startMethod:'shotgun'};
let setup={groups,starts:[...legacy]};ctx.repairLegacyShotgunStarts(setup,1);assert.equal(new Set(setup.starts).size,13);
for(const protect of ['saved','locked','score','manual']){
 setup={groups,starts:[...legacy],saved:protect==='saved'};ctx.store.event.locked=protect==='locked';ctx.firstDayScoreEntry=()=>protect==='score';ctx.store.event.manualScorecards=protect==='manual'?{day1:{groups:{a:{}}}}:{};
 ctx.repairLegacyShotgunStarts(setup,1);assert.deepEqual(setup.starts,legacy);
}
ctx.store.event={startMethod:'single',startHoles:{day1:[10]}};assert(Array.from(ctx.defaultStarts(groups,'single')).every(h=>h===10));
ctx.store.event={startMethod:'two',startHoles:{day1:[3,12]}};assert.deepEqual(Array.from(ctx.defaultStarts([[],[],[]],'two')),[3,12,3]);
load('startingTeeLabel','renderStep6');
assert.equal(ctx.startingTeeLabel({startMethod:'single',startHoles:{day1:[1]}},1),'1st Tee');assert.equal(ctx.startingTeeLabel(ctx.store.event,1),'Two tees: 3rd Tee and 12th Tee');assert.equal(ctx.startingTeeLabel({startMethod:'shotgun'},1),'Shotgun');
const values={men:{blue:{m:4},white:{m:5}},women:{red:{w:''}}};
Object.assign(ctx,{W:{event:{}},eventPlayerCategories:()=>['men','women'],enabledEventTeesForCategory:(_,d,c)=>Object.keys(values[c]),teeHandicapsComplete:(d,t,e,c)=>Object.values(values[c][t]).every(v=>v!==''&&v!=null),wizardPlanningPlayers:()=>['m','w'],eventGaCategory:id=>id==='m'?'men':'women',teeHandicapsFor:(d,t)=>({...values.men,...values.women})[t],eventTeeDisplayName:(d,t)=>t,handicapPlayerName:id=>id==='m'?'Mark':'Alice'});
let check=ctx.wizardHandicapCheck(1);assert.equal(check.ok,false);assert.equal(check.category,'women');assert(check.detail.includes('Female'));assert(check.detail.includes('Women — red: Alice'));assert(check.detail.includes('Players → Set GA & Tee Hcps → Day 1'));
values.men.blue.m='';check=ctx.wizardHandicapCheck(1);assert(check.detail.includes('Male & Female'));
values.men.blue.m=4;values.women.red.w=12;assert.equal(ctx.wizardHandicapCheck(1).ok,true);
load('ambroseRulesText','specialRulesEditorHtml');const html=ctx.ambroseRulesHtml({ambroseMinimumDrives:3,ambroseSelectedPlayerCanPlay:false});
for(const heading of ['OFF THE TEE:','IN THE FAIRWAY:','ON THE GREEN:'])assert(html.includes('<strong>'+heading+'</strong>'));assert(html.includes('CANNOT PLAY A SHOT'));assert(html.includes('At least 3 drives'));
console.log('Planning guidance passed: scoped duplicate names, subtle suffix markup, 1–36 shotgun groups, protected legacy draws, starting tees, category/name/tee guidance and formatted Ambrose rules.');
