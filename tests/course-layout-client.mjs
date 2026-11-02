import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const path=process.argv[2]||'app.js',src=fs.readFileSync(path,'utf8'),module=fs.readFileSync(path.replace(/app\.js$/,'course-layout.js'),'utf8');
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(module,ctx);ctx.GolfCourseLayout=ctx.window.GolfCourseLayout;const L=ctx.GolfCourseLayout;
const base={par:Array(18).fill(4),index:Array.from({length:18},(_,i)=>`${i+1}/${i+19}`),metres:Array(18).fill(350)};
const change={out:3,replacement:19,placement:'before',beside:11,indexMode:'inherit',ratingMode:'retain',details:{'men:middle':{par:3,length:''}}},layout={revision:'one',courseId:'c',changes:[change]};
assert.equal(L.sequence(layout)[9].physical,19);assert.equal(L.sequence(layout)[9].eclectic,3);assert.equal(L.card(base,layout,'men:middle').metres[9],'');assert.equal(L.card(base,layout,'men:middle').index[9],'3/21');assert(base.par.every(v=>v===4));
for(const c of [{...change,replacement:4},{...change,beside:3},{...change,details:{'men:middle':{par:''}}},{...change,indexMode:'club',indexes:{'men:middle':Array(18).fill(1)}}])assert.throws(()=>L.card(base,{changes:[c]},'men:middle'));
let same={changes:[{...change,out:14,replacement:14,placement:'keep'}]};assert.equal(L.card(base,same,'men:middle').par[13],3);assert.equal(L.sequence(same)[13].physical,14);
assert.equal(L.sequence({changes:[{...change,out:8,beside:1}]})[0].physical,19);assert.equal(L.sequence({changes:[{...change,placement:'after',beside:18}]}).at(-1).physical,19);
function extract(name){const start=src.indexOf('  function '+name+'(');assert(start>=0,name);const end=src.indexOf('\n  function ',start+10);return src.slice(start,end);}
const days={1:Array(18).fill(0),2:Array(18).fill(0)};days[1][2]=1;days[1][9]=1;days[2][8]=5;days[2][9]=4;
Object.assign(ctx,{store:{event:{courseLayouts:{day2:layout}}},NO_PARTNER_ID:'np',dayFieldIds:()=>['a'],sharedPositionId:id=>id,sharedActualId:id=>id,leaderboardPlayerPoints:d=>days[d],eventPlayerName:id=>id,leaderRow:(id,name,detail,holes)=>({id,name,detail,holes,total:holes.reduce((n,v)=>n+(v||0),0)}),rankLeaderRows:rows=>rows});
vm.runInContext(extract('calculateLeaderboard'),ctx);const [row]=ctx.calculateLeaderboard({type:'eclectic',days:[1,2]});assert.equal(row.holes[2],4);assert.equal(row.holes[9],5);assert.equal(row.total,9);
Object.assign(ctx,{course:()=>({teeScorecards:{middle:base}}),courseScorecard:(c,t)=>c.teeScorecards[t],selectedEventTee:()=> 'middle',eventCourseCategory:()=> 'men'});ctx.store.event.course1='c';ctx.store.event.course2='c';
for(const name of ['eventTeeCard','eventCourseScorecard'])vm.runInContext(extract(name),ctx);
assert.equal(ctx.eventCourseScorecard(1).par[9],4);assert.equal(ctx.eventCourseScorecard(2).par[9],3);assert(base.par.every(v=>v===4));
assert(src.includes('id="liveCourseLayout"'));assert(src.includes('layoutRevision:layout.revision'));assert(src.includes('showLayoutAcknowledgement(day,selected,host)'));
console.log('Course layout client passed: optional distance, self-replacement, first/last positioning, rejected invalid data, day-specific card, immutable base and actual Eclectic leaderboard.');

const local={};Object.assign(ctx,{scoringDayStore:()=>local});ctx.store.cloud={role:'player'};ctx.store.event.playerLayoutAck={2:{a:'one'}};for(const n of ['layoutHasEntries','scorerStore'])vm.runInContext(extract(n),ctx);
assert.equal(ctx.scorerStore(2,'a')._meta.layoutRevision,'one');local.a={};assert.equal(ctx.scorerStore(2,'a')._meta.layoutRevision,'one');local.a={1:{self:{gross:4}},_meta:{layoutRevision:'old'}};assert.equal(ctx.scorerStore(2,'a')._meta.layoutRevision,'old');
console.log('Layout revision survives an empty-card refresh; old entered cards are never relabelled.');
