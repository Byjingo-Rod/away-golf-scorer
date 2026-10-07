const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const file=process.argv[2]||'app.js',source=fs.readFileSync(file,'utf8');
function extract(name){const start=source.indexOf('  function '+name+'(');assert(start>=0,name);const end=source.indexOf('\n  function ',start+10);return source.slice(start,end<0?source.length:end);}
const NP='system-no-partner',plain=x=>JSON.parse(JSON.stringify(x));
const ctx={NO_PARTNER_ID:NP,store:{event:{}},console,firstDayScoreEntry:()=>null,ambroseIsOn:()=>ctx.store.event.competitions.includes('ambrose'),dayFieldIds:()=>ctx.store.event.confirmed,ntpHolesInPlayingOrder:()=>[3,8,15],shuffleCopy:a=>[...a].reverse(),chooseRandom:(a,exclude=[])=>a.find(x=>!exclude.includes(x))||null,player:id=>({name:id}),manualSelectedCompetitions:()=>new Set(['single','fourball','best3of4','teamPutts','par3','ntp']),groupHasScoreEntries:()=>false,sessionStorage:{},scoreSequence:()=>Array.from({length:18},(_,i)=>i+1),groupStartingHole:()=>1,yellowBallIsOn:()=>true};
vm.createContext(ctx);
for(const name of ["eventDays","competitionDays","competitionIsOn","countingRounds"])vm.runInContext(extract(name),ctx);
for(const name of ['makeGroups','noPartnerContext','ambroseThreePlayerContext','ensureOneShortTeamSelections','swapWholeTeams','setupForTeam','ensureShortTeamSelections','shortTeamRuleLines','playerGroupContext','markerTargetFor','leaderboardUnits','manualRequirements','yellowBallTeam','yellowBallPlayerForHole'])vm.runInContext(extract(name),ctx);
for(const [count,sizes] of [[6,[3,3]],[7,[4,3]],[9,[3,3,3]],[10,[4,3,3]],[14,[4,4,3,3]],[18,[4,4,4,3,3]],[20,[4,4,4,4,4]]]){
 const ids=Array.from({length:count},(_,i)=>'p'+i);ctx.store.event={confirmed:ids,days:2,competitions:['single','fourball','best3of4','teamPutts','par3','ntp','yellowBall'],groupSetup:{}};
 for(const day of [1,2]){
  const groups=ctx.makeGroups(ids),setup={groups,saved:false,virtualPlayer:null};ctx.store.event.groupSetup['day'+day]=setup;ctx.ensureShortTeamSelections(setup,day);
  assert.deepEqual(plain(groups.map(g=>g.filter(id=>id!==NP).length)),sizes);
  assert.deepEqual(plain(groups.flat().filter(id=>id!==NP)),ids);
  const assignments=Object.entries(setup.shortTeams);assert.equal(assignments.length,sizes.filter(n=>n===3).length);
  assert.equal(new Set(assignments.map(([,a])=>a.virtualPlayer)).size,assignments.length);
  for(const [gi,a] of assignments){const group=groups[gi];assert(!group.includes(a.virtualPlayer));assert.equal(new Set(Object.values(a.ntpExtraPlayers)).size,3);assert(Object.values(a.ntpExtraPlayers).every(id=>group.includes(id)&&id!==NP));assert.equal(ctx.setupForTeam(setup,+gi).virtualPlayer,a.virtualPlayer);assert.equal(ctx.manualRequirements(day,+gi).virtualId,a.virtualPlayer);const real=group.filter(id=>id!==NP);assert.deepEqual(plain(real.map(id=>ctx.markerTargetFor(id,day))),[real[1],real[2],real[0]]);}
  const before=JSON.stringify(setup.shortTeams);setup.saved=true;ctx.ensureShortTeamSelections(setup,day);assert.equal(JSON.stringify(setup.shortTeams),before);ctx.store.event.groupSetup['day'+day]=plain(setup);ctx.ensureShortTeamSelections(ctx.store.event.groupSetup['day'+day],day);assert.equal(JSON.stringify(ctx.store.event.groupSetup['day'+day].shortTeams),before);
  const units=ctx.leaderboardUnits(day,'team');assert(units.every(u=>u.ids.length===4));const pairs=ctx.leaderboardUnits(day,'pair');assert(pairs.every(u=>u.ids.length===2));
  for(const [gi,a] of assignments){assert(units[gi].ids.includes(a.virtualPlayer));for(const hole of [1,2,3,4])assert(groups[gi].includes(ctx.yellowBallPlayerForHole(day,+gi,hole)));}
  const rules=ctx.shortTeamRuleLines(ctx.store.event,day);assert.equal(rules.length,assignments.length*2);
 }
}
// An old saved event keeps its exact VP and NTP assignment.
ctx.store.event={confirmed:['a','b','c','d','e','f','g'],competitions:['fourball','ntp'],days:1,groupSetup:{}};
const legacy={groups:[['a','b','c',NP],['d','e','f','g']],saved:true,virtualPlayer:'g',ntpExtraPlayer:'a',ntpExtraPlayers:{}};ctx.store.event.groupSetup.day1=legacy;ctx.ensureShortTeamSelections(legacy,1);assert.equal(legacy.shortTeams['0'].virtualPlayer,'g');assert.equal(legacy.shortTeams['0'].ntpExtraPlayer,'a');
// Ambrose never borrows a score, but every three-ball gets extra attempts.
ctx.store.event={confirmed:['a','b','c','d','e','f'],competitions:['ambrose','ntp'],days:1,groupSetup:{}};const ambrose={groups:ctx.makeGroups(ctx.store.event.confirmed)};ctx.store.event.groupSetup.day1=ambrose;ctx.ensureShortTeamSelections(ambrose,1);assert.equal(Object.keys(ambrose.shortTeams).length,2);assert(Object.values(ambrose.shortTeams).every(a=>!a.virtualPlayer&&Object.keys(a.ntpExtraPlayers).length===3));assert(ambrose.groups.every(g=>g.length===3&&!g.includes(NP)));
console.log('Passed '+file+': balanced 6/7/9/10/18/20 draws, distinct external VPs, NTP rotation per team, real-player marking, correct leaderboard/manual team IDs, Yellow Ball, stable save/reload, legacy preservation and Ambrose');

// Whole-team swaps exchange slot numbers, keeping each team and all its roles intact.
ctx.store.event={confirmed:Array.from({length:14},(_,i)=>'p'+i),competitions:['fourball','ntp'],days:1,groupSetup:{},ambroseRoleAssignments:{day1:{1:{scorerId:'p4'},2:{scorerId:'p8'}}}};
const event=ctx.store.event, setup={groups:ctx.makeGroups(event.confirmed),starts:[1,1,10,10],saved:false};event.groupSetup.day1=setup;ctx.ensureShortTeamSelections(setup,1);
event.emergencyReplacements={day1:{groupIndex:2}};
const old=plain(setup),roles=plain(event.ambroseRoleAssignments.day1);
assert(ctx.swapWholeTeams(event,1,2,1));assert.deepEqual(plain(setup.groups[1]),old.groups[2]);assert.deepEqual(plain(setup.groups[2]),old.groups[1]);assert.deepEqual(plain(setup.starts),old.starts);assert.deepEqual(plain(setup.shortTeams['1']),old.shortTeams['2']);assert(!setup.shortTeams['2']);assert.deepEqual(plain(event.ambroseRoleAssignments.day1[1]),roles[2]);assert.equal(event.emergencyReplacements.day1.groupIndex,1);
assert(ctx.swapWholeTeams(event,1,2,1));assert.deepEqual(plain(setup.groups),old.groups);assert.deepEqual(plain(setup.shortTeams),old.shortTeams);
setup.saved=true;assert(!ctx.swapWholeTeams(event,1,0,1));setup.saved=false;event.locked=true;assert(!ctx.swapWholeTeams(event,1,0,1));event.locked=false;ctx.firstDayScoreEntry=()=>({hole:1});assert(!ctx.swapWholeTeams(event,1,0,1));ctx.firstDayScoreEntry=()=>null;assert(!ctx.swapWholeTeams(event,1,0,0));assert(!ctx.swapWholeTeams(event,1,0,99));
console.log('Passed whole-team swap: members, VP/NTP, Ambrose roles and emergency move; tee slots stay; locked/saved/started draws protected');
