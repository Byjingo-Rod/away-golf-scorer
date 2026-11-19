// Generated from matchplay-model.mjs; keep the shared model as the source.
(function(){
const DIVISIONS = ['Men’s Club Championship','Men’s Plate (A Reserve)','Men’s Middle Markers','Men’s Long Markers','Ladies’ Club Championship','Ladies’ Bronze 2','Ladies’ Bronze 3'];
const scheduledForDivision = division => /Club Championship$/.test(division)?36:18;
const UNIVERSAL_INDEX=[18,8,12,3,14,6,10,1,16,5,11,2,15,7,13,4,17,9];
const handicapped=s=>s.config.format==='handicapped';
function parseHcp(value){const t=String(value??'').trim();if(!t||!/^([+]?\d+|-\d+)$/.test(t))throw Error('Enter a whole-number playing handicap (use +2 for a plus handicap).');const n=t.startsWith('+')?-Number(t.slice(1)):Number(t);if(n< -10||n>54)throw Error('Playing handicap must be between +10 and 54.');return n;}
const formatHcp=n=>n<0?'+'+Math.abs(n):String(n);
function validateIndex(index){if(!Array.isArray(index)||index.length!==18||new Set(index).size!==18||index.some(n=>!Number.isInteger(n)||n<1||n>18))throw Error('The hole index must contain each number 1–18 exactly once.');return index;}
function matchHandicaps(s,key){const locked=s.matches[key].handicap;if(locked)return locked;if(!handicapped(s))return {format:'scratch',playing:[0,0],allowances:[0,0],index:[...UNIVERSAL_INDEX]};const playing=opponents(s,key).map(id=>(s.qualifyingHandicaps?.[id]??getPlayer(s,id)?.playingHcp));if(playing.some(n=>!Number.isInteger(n)))throw Error('Enter both playing handicaps before scoring this match.');const lowest=Math.min(...playing);return {format:'handicapped',playing,allowances:playing.map(n=>n-lowest),index:[...validateIndex(s.config.indexSource==='club'?s.config.clubIndex:s.config.universalIndex||UNIVERSAL_INDEX)]};}
function holeStrokes(s,key,hole){const h=matchHandicaps(s,key),course=courseHole(s,hole),index=h.index[course-1];return {course,index,strokes:h.allowances.map(n=>Math.floor(n/18)+(index<=n%18?1:0))};}
function lockHandicaps(s,key){s.matches[key].handicap??=clone(matchHandicaps(s,key));}
const ORDER=[1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11];
const ROUNDS=['Round of 16','Quarterfinals','Semifinals','Final'];
const clone=x=>structuredClone(x);
const error=message=>{throw Error(message)};
function sampleDivision(scheduled=36){
 const names=['Alex Andrews','Blair Bennett','Casey Collins','Drew Davies','Evan Edwards','Finn Foster','Gray Gibson','Hayden Hughes','Indy Ingram','Jamie James','Kai Kennedy','Lee Lawson','Morgan Miller','Noel Nelson','Ollie Owens','Parker Price','Quinn Quinn','Robin Reed','Sam Stewart','Taylor Turner','Val Vale'];
 return {schema:1,config:{title:'TEST — Oatlands Club Matchplay',division:'Men’s Club Championship',course:'Oatlands GC',tee:'Club championship tee',scheduled,dates:['2026-11-22','2026-11-29','2026-12-06','2026-12-13'],times:['07:00','07:00','07:00','07:30'],secondTimes:['12:00','12:00','12:00','12:00'],intervals:[8,8,0,0],playoff:[1,18],finalMode:'referee',replacementDeadline:'2026-11-22T07:00'},players:names.map((name,i)=>({id:'p'+(i+1),name,registrationNo:String(2000000000+i+1),total:140+i,seed:i<16?i+1:null,status:i<16?'accepted':'standby'})),seats:Array.from({length:16},(_,i)=>'p'+(i+1)),reserveOrder:['p17','p18','p19','p20','p21'],matches:Object.fromEntries(Array.from({length:4},(_,r)=>Array.from({length:8/2**r},(_,m)=>['r'+r+'m'+m,{holes:{},checks:{},result:null}])).flat()),published:false,reservesClosed:false,finalOpen:false,refereeName:'',refereeJoined:false,audit:[]};
}
const getPlayer=(s,id)=>s.players.find(p=>p.id===id);
const keyFor=(r,m)=>'r'+r+'m'+m;
function location(key){const m=/^r([0-3])m([0-7])$/.exec(key);if(!m||+m[2]>=8/2**+m[1])error('Unknown match.');return [+m[1],+m[2]];}
function opponents(s,key){const [r,m]=location(key);if(!r)return ORDER.slice(m*2,m*2+2).map(seed=>s.seats[seed-1]||null);return [0,1].map(i=>s.matches[keyFor(r-1,m*2+i)].result?.winnerId||null);}
const availableReserves=s=>s.reserveOrder.map(id=>getPlayer(s,id)).filter(p=>p?.status==='standby');
const hasStarted=match=>!!match.result||Object.keys(match.holes).length>0||!!match.concession;
function teeTime(s,r,m,second=false){const time=(second?s.config.secondTimes:s.config.times)[r];if(!time)return 'Not set';const [h,min]=time.split(':').map(Number),group=Math.min(m,8/2**r-1-m),value=h*60+min+group*(r<2?Number(s.config.intervals[r]):0);if(value>=1440)return 'Next day — review';return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');}
function courseHole(s,matchHole){const n=s.config.scheduled;return matchHole<=n?(matchHole-1)%18+1:s.config.playoff[(matchHole-n-1)%s.config.playoff.length];}
function refereeMode(s,key){return location(key)[0]===3&&s.config.finalMode==='referee';}
function matchState(s,key){
 const match=s.matches[key],players=opponents(s,key),scheduled=Number(s.config.scheduled),ref=refereeMode(s,key);let lead=0,completed=0,issues=0,waiting=0;const rows=[];
 if(match.result)return {...match.result,accepted:true,players,rows:match.result.rows||[],nextHole:(match.result.played||0)+1};
 if(match.concession){const prior=matchState({...s,matches:{...s.matches,[key]:{...match,concession:null}}},key);return {...prior,players,leader:match.concession.to,winnerId:players[match.concession.to==='a'?0:1],text:'Conceded',issues:0,waiting:0,ready:true};}
 let winnerId=null,text='All square';
 for(let hole=1;hole<=Object.keys(match.holes).length+1;hole++){
  const h=match.holes[hole];if(!h)break;
  if(h.pendingConcession)break;
  const a=ref?h.refA:h.markerA,b=ref?h.refB:h.markerB;
  if(!h.concededTo&&(a==null||b==null))break;
  const allocation=holeStrokes(s,key,hole),[strokesA,strokesB]=allocation.strokes,netA=a==null?null:a-strokesA,netB=b==null?null:b-strokesB;
  let outcome=h.concededTo==='a'?1:h.concededTo==='b'?-1:netA<netB?1:netA>netB?-1:0;
  const mismatches=h.concededTo?0:[['selfA',a],['selfB',b],...(ref?[['markerA',a],['markerB',b]]:[])].filter(([k,v])=>h[k]!=null&&h[k]!==v).length;
  const unChecked=h.concededTo?false:h.selfA==null||h.selfB==null;
  issues+=mismatches;waiting+=unChecked?1:0;lead+=outcome;completed=hole;
  text=lead===0?'All square':getPlayer(s,players[lead>0?0:1])?.name+' '+Math.abs(lead)+' up';
  rows.push({hole,course:courseHole(s,hole),a,b,strokesA,strokesB,netA,netB,index:allocation.index,selfA:h.selfA,selfB:h.selfB,markerA:h.markerA,markerB:h.markerB,concededTo:h.concededTo,strokeConcededTo:h.strokeConcededTo,lead,text,issue:mismatches>0,waiting:unChecked});
  if((hole<scheduled&&Math.abs(lead)>scheduled-hole)||(hole>=scheduled&&lead!==0)){
   winnerId=players[lead>0?0:1];text=hole<scheduled?`${Math.abs(lead)}&${scheduled-hole}`:hole===scheduled?`${Math.abs(lead)} up`:`${hole}${ordinal(hole)} hole`;break;
  }
 }
 const ready=!!winnerId&&(ref||(!issues&&!waiting));
 return {players,lead,leader:lead>0?'a':lead<0?'b':null,winnerId,text,played:completed,rows,nextHole:completed+1,issues,waiting,ready,accepted:false};
}
function ordinal(n){return n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th');}
function editable(s,key){if(!s.published)error('Publish the draw first.');if(s.matches[key].result)error('This result is confirmed. The organiser must reopen it before making corrections.');if(opponents(s,key).some(id=>!id))error('Both opponents must be confirmed in this branch first.');}
function score(value){if(value===''||value==null)return null;const n=Number(value);if(!Number.isInteger(n)||n<1||n>30)error('Enter a whole-number gross score from 1 to 30.');return n;}
function recordScores(s,key,role,hole,own,marked){
 editable(s,key);if(s.matches[key].concession)error('The match is conceded; confirm its result rather than entering more scores.');const state=matchState(s,key),h=Number(hole),ref=role==='referee';
 if(!['a','b','referee'].includes(role))error('Choose an authorised scoring device.');
 if(ref&&(!refereeMode(s,key)||!s.finalOpen||!s.refereeJoined))error('Referee scoring is available only to the joined final referee in Referee scoring mode.');
 if(!refereeMode(s,key)&&ref)error('Player scoring is selected for this match.');
 if(!Number.isInteger(h)||h<1||h>state.nextHole||state.winnerId&&h>state.played)error('Complete earlier holes first; do not add holes after the match is decided.');
 const one=score(own),two=score(marked);if(one==null&&two==null)error('Enter at least one score.');
 const row=s.matches[key].holes[h]||{};if(row.pendingConcession)error('Confirm the concession record before entering more scores on this hole.');if(row.concededTo)error('This hole was recorded as conceded. Ask the organiser to review a mistaken record.');
 if(ref){row.refA=one;row.refB=two;}else if(role==='a'){row.selfA=one;row.markerB=two;}else{row.selfB=one;row.markerA=two;}
 lockHandicaps(s,key);s.matches[key].holes[h]=row;s.matches[key].checks={};s.audit.push({action:'scores',match:key,hole:h,role,at:new Date().toISOString()});
}
function concede(s,key,role,whole=false,hole=1,concedingPlayer=null){
 editable(s,key);if(!['a','b','referee'].includes(role))error('Only a player or assigned referee can record a concession.');
 const by=role==='referee'?concedingPlayer:role;
 if(role==='referee'&&(!refereeMode(s,key)||!s.finalOpen||!s.refereeJoined))error('Join the final as its scoring referee first.');
 if(!['a','b'].includes(by))error('Select the player who made the concession.');
 const to=by==='a'?'b':'a';const current=matchState(s,key);if(current.winnerId)error('The match has already been decided.');
 lockHandicaps(s,key);if(whole)s.matches[key].concession={to,by};else{if(current.winnerId)error('The match has already been decided.');if(Number(hole)!==current.nextHole)error('Concede the current unfinished hole.');s.matches[key].holes[hole]={concededTo:to,by};}
 s.matches[key].checks={};s.audit.push({action:whole?'concede match':'concede hole',match:key,by:role,at:new Date().toISOString()});
}
// Both devices acknowledge the recorded hole concession. This does not change when a concession is valid under the Rules.
function requestHoleConcession(s,key,role,hole,by){
 editable(s,key);
 if(!['a','b'].includes(role)||!['a','b'].includes(by))error('Choose the player who conceded the hole.');
 if(refereeMode(s,key))error('The assigned referee records concessions in this final.');
 const state=matchState(s,key),h=Number(hole);
 if(state.winnerId||h!==state.nextHole)error('Record a concession on the current unfinished hole.');
 if(s.matches[key].holes[h]?.pendingConcession)error('This concession is already waiting for the other player to confirm.');
 lockHandicaps(s,key);
 const row=s.matches[key].holes[h]||{};
 row.pendingConcession={by,to:by==='a'?'b':'a',recordedBy:role,recordedAt:new Date().toISOString()};
 s.matches[key].holes[h]=row;s.matches[key].checks={};
 s.audit.push({action:'hole concession recorded',match:key,hole:h,by,role,at:row.pendingConcession.recordedAt});
}
function confirmHoleConcession(s,key,role,hole){
 editable(s,key);const h=Number(hole),record=s.matches[key].holes[h]?.pendingConcession;
 if(!record)error('There is no concession waiting for confirmation on this hole.');
 if(!['a','b'].includes(role)||role===record.recordedBy)error('The other player must confirm this concession record.');
 // Retain the standard model operation so hole awards and match endings stay identical.
 concede(s,key,record.by,false,h);
 s.matches[key].holes[h].concessionRecord={...record,confirmedBy:role,confirmedAt:new Date().toISOString()};
 s.audit.push({action:'hole concession confirmed',match:key,hole:h,role,at:new Date().toISOString()});
}
function markConcededStroke(s,key,role,hole){editable(s,key);if(!['a','b'].includes(role))error('A player records their concession.');const state=matchState(s,key);if(state.winnerId||hole<1||hole>state.nextHole)error('Use the current unfinished hole.');const row=s.matches[key].holes[hole]||{};row.strokeConcededTo=role==='a'?'b':'a';s.matches[key].holes[hole]=row;s.audit.push({action:'conceded stroke',match:key,hole,by:role});}
function confirmResult(s,key,role,reason=''){
 editable(s,key);let state=matchState(s,key);const ref=refereeMode(s,key),match=s.matches[key];if(!state.winnerId)error('The match has not been decided.');
 if(role==='organiser'){if(reason.trim().length<5)error('Enter a reason for organiser acceptance.');}
 else if(ref){if(role!=='referee'||!s.finalOpen||!s.refereeJoined)error('The assigned referee confirms this final.');}
 else {if(!['a','b'].includes(role))error('Player confirmation required.');if(state.issues)error('Resolve score disagreements before confirming.');
 // Explicit final confirmation accepts this player's displayed recognised marker scores.
 for(const row of state.rows){if(row.concededTo)continue;const entry=match.holes[row.hole],field=role==='a'?'selfA':'selfB',marked=role==='a'?entry.markerA:entry.markerB;if(entry[field]==null&&marked!=null)entry[field]=marked;}
 state=matchState(s,key);match.checks[role]=true;if(!match.checks.a||!match.checks.b)return false;if(!state.ready)error('Complete the remaining score checks before confirming.');}
 match.result={winnerId:state.winnerId,text:state.text,played:state.played,rows:state.rows,by:role,reason:role==='organiser'?reason:'',type:match.concession?'concession':'played'};
 s.audit.push({action:'confirmed result',match:key,winner:state.winnerId,role,reason,at:new Date().toISOString()});closeUnusedReserves(s);return true;
}
function walkover(s,key,winnerId,role,reason){
 editable(s,key);if(role!=='organiser'&&!(role==='referee'&&location(key)[0]===3&&s.finalOpen&&s.refereeJoined))error('The organiser or assigned final referee records a walkover.');
 if(Object.keys(s.matches[key].holes).length||s.matches[key].concession)error('A walkover is for a match in which no ball has been hit. Use match concession or organiser review for a started match.');
 if(!opponents(s,key).includes(winnerId))error('Choose an opponent in this match.');const absentId=opponents(s,key).find(id=>id!==winnerId);reason=playerLabel(s,absentId)+' did not attend.';
 s.matches[key].result={winnerId,text:'W/O',played:0,rows:[],type:'walkover',absentId,reason,by:role};s.audit.push({action:'walkover',match:key,winner:winnerId,reason,at:new Date().toISOString()});closeUnusedReserves(s);
}
function closeUnusedReserves(s){if(Array.from({length:8},(_,m)=>s.matches[keyFor(0,m)].result).every(Boolean)){s.reservesClosed=true;for(const p of availableReserves(s))p.status='released';}}
function withdraw(s,id,now=Date.now()){
 const p=getPlayer(s,id);if(!p)error('Player not found.');if(!['accepted','standby'].includes(p.status))error('This player is already inactive.');
 if(s.reservesClosed||now>new Date(s.config.replacementDeadline).getTime())error('The first-round replacement window is closed. Use walkover or committee review.');
 const index=s.seats.indexOf(id);if(index>=0){const matchIndex=Math.floor(ORDER.indexOf(index+1)/2);if(hasStarted(s.matches[keyFor(0,matchIndex)]))error('That match has started or has a confirmed result. It cannot receive a reserve.');s.seats[index]=null;}
 p.status='withdrawn';s.audit.push({action:'withdrawn',player:id,seed:index>=0?index+1:null,at:new Date().toISOString()});fillVacancies(s);return p;
}
function fillVacancies(s){for(let i=0;i<s.seats.length;i++)if(!s.seats[i]){const p=availableReserves(s)[0];if(!p)break;p.status='accepted';p.seed=i+1;s.seats[i]=p.id;s.audit.push({action:'reserve promoted',player:p.id,seed:i+1,at:new Date().toISOString()});}}
function playerLabel(s,id){const p=getPlayer(s,id);if(!p)return 'Awaiting qualifier';const duplicate=s.players.some(other=>other.id!==id&&other.name.trim().toLowerCase()===p.name.trim().toLowerCase());return p.name+(duplicate?' · Registration No '+(p.registrationNo||'required'):'');}
function checkIdentities(players){const links=new Set();for(const p of players){if(p.registrationNo){if(!/^\d{1,12}$/.test(p.registrationNo))error('Registration numbers must contain up to 12 digits.');if(links.has(p.registrationNo))error('A registration number is listed more than once.');links.add(p.registrationNo);}if(players.some(q=>q!==p&&q.name.trim().toLowerCase()===p.name.trim().toLowerCase())&&!p.registrationNo)error('Players with the same name need different registration numbers.');}}
function addReserve(s,name,registrationNo,total,now=Date.now()){
 if(s.reservesClosed||now>new Date(s.config.replacementDeadline).getTime())error('The reserve window is closed.');
 if(availableReserves(s).length>=5)error('Five available reserves are already listed. Withdraw a declined reserve first.');
 if(!name.trim())error('Enter the next eligible qualifier’s name.');
 const id='reserve-'+Date.now()+'-'+s.players.length,p={id,name:name.trim(),registrationNo:String(registrationNo??'').trim(),total:total===''?'':Number(total),seed:null,status:'standby'};checkIdentities([...s.players,p]);s.players.push(p);s.reserveOrder.push(id);fillVacancies(s);return id;
}
function reopen(s,key,reason){
 if(!s.matches[key].result)error('This match is not confirmed.');if(reason.trim().length<5)error('Record the reason for reopening.');const [r,m]=location(key);
 if(r<3&&hasStarted(s.matches[keyFor(r+1,Math.floor(m/2))]))error('The next match has started or been confirmed. Committee review is required; the draw cannot change automatically.');
 s.matches[key].result=null;s.matches[key].checks={};s.audit.push({action:'reopened',match:key,reason,at:new Date().toISOString()});
}
function validateSetup(s){if(handicapped(s)){validateIndex(s.config.indexSource==='club'?s.config.clubIndex:s.config.universalIndex||UNIVERSAL_INDEX);for(const p of s.players.filter(p=>['accepted','standby'].includes(p.status)))if(!Number.isInteger(p.playingHcp))error('Enter a playing handicap for every qualifier and reserve.');}if(!s.config.title.trim()||!s.config.division.trim())error('Enter the championship and division names.');if(![18,36].includes(Number(s.config.scheduled)))error('Choose 18 or 36 scheduled holes.');if(!s.config.playoff.length||new Set(s.config.playoff).size!==s.config.playoff.length||s.config.playoff.some(h=>!Number.isInteger(h)||h<1||h>18))error('Choose an ordered playoff sequence from holes 1–18.');if(s.seats.length!==16||s.seats.some(id=>!getPlayer(s,id))||new Set(s.seats).size!==16)error('Fill all 16 qualifying positions with different players.');if(availableReserves(s).length>5)error('List at most five available reserves.');if(s.config.dates.some(d=>!d)||s.config.times.some(t=>!t)||s.config.intervals.slice(0,2).some(t=>!(Number(t)>=1&&Number(t)<=60)))error('Complete each round date and tee time, plus the round of 16 and quarterfinal intervals.');if(s.config.dates.some((d,i)=>i>0&&d<s.config.dates[i-1]))error('Round dates must stay in order.');if(!s.config.replacementDeadline)error('Set the first-round replacement deadline.');return true;}
function importQualifiers(s,text){
 if(s.published)error('Return to setup before replacing the qualifier list.');
 const rows=text.trim().split(/\r?\n/).filter(x=>x.trim()).map(x=>x.split('\t').map(y=>y.trim()));if(rows[0]?.[0]?.toLowerCase()==='seed')rows.shift();
 const players=[],seats=Array(16).fill(null),reserves=[],seenSeeds=new Set();
 for(const values of rows){const [position,name,registrationNo='',fourth='',fifth='']=values,total=handicapped(s)?fifth:fourth,playingHcp=handicapped(s)?parseHcp(fourth):undefined;const reserve=/^r[1-5]$/i.test(position),seed=Number(position);if(!reserve&&(!Number.isInteger(seed)||seed<1||seed>16))error('Use seeds 1–16 and reserve positions R1–R5.');if(!name)error('Every position needs a name.');const canonical=reserve?'R'+Number(position.slice(1)):String(seed);if(seenSeeds.has(canonical))error('A seed or reserve position is repeated.');seenSeeds.add(canonical);
  const id='import-'+position.toUpperCase();players.push({id,name,total,registrationNo,...(handicapped(s)?{playingHcp}:{}),seed:reserve?null:seed,status:reserve?'standby':'accepted'});if(reserve)reserves.push([Number(position.slice(1)),id]);else seats[seed-1]=id;
 }
 if(seats.some(id=>!id))error('The club list must contain all seeds 1–16.');checkIdentities(players);
 s.players=players;s.seats=seats;s.reserveOrder=reserves.sort((a,b)=>a[0]-b[0]).map(x=>x[1]);s.audit.push({action:'club qualifiers imported',accepted:16,reserves:reserves.length});return s;
}
function demo(scheduled=18,final=false){const s=sampleDivision(scheduled);s.published=true;if(final){for(let r=0;r<3;r++)for(let m=0;m<8/2**r;m++){const key=keyFor(r,m);for(let h=1;h<=scheduled;h++){recordScores(s,key,'a',h,4,h===1?5:4);recordScores(s,key,'b',h,h===1?5:4,4);}confirmResult(s,key,'a');confirmResult(s,key,'b');}s.finalOpen=true;s.refereeName='Sample Referee';}else{for(let h=1;h<=scheduled;h++){recordScores(s,'r0m0','a',h,4,4);recordScores(s,'r0m0','b',h,4,4);}}return s;}
const copyDivision=clone;

function joinReferee(s,key){if(key!=='r3m0'||!s.finalOpen||!s.refereeName||!s.published||!opponents(s,key).every(Boolean))error('The organiser must allocate and open this final first.');s.refereeJoined=true;return key;}

function finalMatchNo(s){return s.config.finalMatchNo||Math.max(1,DIVISIONS.indexOf(s.config.division)+1);}
function ensureReferees(s){if(!s.referees){s.referees=Array.from({length:10},(_,i)=>({id:'ref-'+(i+1),name:i===0?s.refereeName||'':'',selected:i===0&&!!s.refereeName,matchNo:i===0&&s.refereeName?finalMatchNo(s):null}));}while(s.referees.length<10)s.referees.push({id:"ref-"+(s.referees.length+1),name:"",selected:false,matchNo:null});return s.referees;}
function syncReferee(s){ensureReferees(s);const selected=s.referees.find(r=>r.selected&&r.matchNo===finalMatchNo(s));const value=selected?.name||'';if(value!==s.refereeName){s.refereeName=value;s.refereeJoined=false;}return selected;}
function setReferee(s,id,patch){const refs=ensureReferees(s),previous=refs.find(r=>r.id===id);if(!previous)error('Referee not found.');const next={...previous,...patch};next.name=next.name.trim();if(next.selected&&!next.name)error('Enter the referee’s name before selecting them.');if(next.selected&&(!Number.isInteger(next.matchNo)||next.matchNo<1||next.matchNo>10))error('Select Match No 1–10.');if(next.selected&&refs.some(r=>r.id!==id&&r.selected&&r.matchNo===next.matchNo))error('That match already has a selected referee. Choose a different match or untick the existing referee.');if(next.name&&refs.some(r=>r.id!==id&&r.name.toLowerCase()===next.name.toLowerCase()))error('That referee is already listed.');if(hasStarted(s.matches.r3m0)&&(previous.selected&&previous.matchNo===finalMatchNo(s)||next.selected&&next.matchNo===finalMatchNo(s)))error('This final has started; its referee allocation is locked.');Object.assign(previous,next);syncReferee(s);return previous;}
function assignCurrentReferee(s,name){const refs=ensureReferees(s),current=refs.find(r=>r.selected&&r.matchNo===finalMatchNo(s)),existing=refs.find(r=>r.name.toLowerCase()===name.trim().toLowerCase()),target=existing||current||refs.find(r=>!r.name);if(!target)error('Add the referee to Available Referees first.');if(current&&current.id!==target.id)setReferee(s,current.id,{selected:false});return setReferee(s,target.id,{name,selected:true,matchNo:finalMatchNo(s)});}

function visualExample(kind){const s=sampleDivision(36);s.published=true;const leads=kind==='five'?[-1,-1,0,1,1,0,-1,-1,-2,-3,-2,-3,-4,-3,-4,-5,-5,-5]:Array(36).fill(-1);let prior=0;leads.forEach((lead,i)=>{const delta=lead-prior,a=delta<0?5:4,b=delta>0?5:4;recordScores(s,'r0m0','a',i+1,a,b);recordScores(s,'r0m0','b',i+1,b,a);prior=lead;});return matchState(s,'r0m0');}

function overviewWindow(state,all=false){const last=state.rows.at(-1)?.hole||0,boundary=all?0:Math.min(36,Math.floor(last/9)*9);return {turn:boundary?state.rows.find(row=>row.hole===boundary)||null:null,rows:state.rows.filter(row=>row.hole>boundary),start:boundary+1};}
function ownScoreDiffers(row,side){return !row.concededTo&&row['self'+side]!=null&&row['self'+side]!==row[side.toLowerCase()];}

function extendedVisualExample(kind){if(kind==='playoff'){const s=sampleDivision(36);s.published=true;for(let h=1;h<=41;h++){const a=h===41?5:4,b=4;recordScores(s,'r0m0','a',h,a,b);recordScores(s,'r0m0','b',h,b,a);}return matchState(s,'r0m0');}const state=visualExample(kind);if(kind==='five'){state.rows.push({...state.rows.at(-1),hole:19,course:1,a:4,b:4,selfA:4,selfB:4});state.played=19;}return state;}

function freezeQualifyingHandicaps(s){if(!handicapped(s))return;validateSetup(s);s.qualifyingHandicaps=Object.fromEntries(s.players.filter(p=>['accepted','standby'].includes(p.status)).map(p=>[p.id,p.playingHcp]));}

// Away scorecards can hold primary/second stroke indexes. Matchplay uses primary only.
const OATLANDS_CARD_INDEX=['8/28','12/33','7/25','6/24','13/32','2/21','18/36','15/31','10/27','17/35','11/29','3/23','16/34','4/19','5/22','9/26','14/30','1/20'];
function primaryClubIndex(card){const values=Array.isArray(card)?card:card?.index;if(!Array.isArray(values)||values.length!==18)throw Error('Supply the 18 course-hole indexes in hole order.');const primary=values.map(value=>{const text=String(value??'').trim();if(!/^\d{1,2}(?:\s*\/\s*\d{1,2})?$/.test(text))throw Error('Use a primary index such as 1 or a paired index such as 1/20.');return Number(text.split('/')[0].trim());});return [...validateIndex(primary)];}
const gradeName=(category,number)=>(category==='women'?'Ladies’':'Men’s')+' '+String.fromCharCode(64+number)+' Grade';
function sampleGradeHandicaps(number,count=21){const ranges=[[0,12],[13,18],[19,26],[27,36],[37,54]],range=ranges[number-1];if(!range)throw Error('Choose grade 1–5.');return Array.from({length:count},(_,i)=>number===1?(i===0?-2:i===1?0:1+(i-2)%12):range[0]+i%(range[1]-range[0]+1));}

function handicapRangeIssues(s,range=s.config.handicapRange){if(!handicapped(s)||!range)return [];return s.players.filter(p=>['accepted','standby'].includes(p.status)).filter(p=>{const n=s.qualifyingHandicaps?.[p.id]??p.playingHcp;return Number.isInteger(n)&&((range.min!=null&&n<range.min)||(range.max!=null&&n>range.max));});}
const showCourseHole=(scheduled,hole)=>Number(scheduled)===36||hole>18;
function scheduledVisualExample(kind,scheduled=18,playoff=[1,18]){const s=sampleDivision(scheduled);s.config.playoff=[...playoff];s.published=true;const leads=kind==='playoff'?Array(scheduled+5).fill(0).map((v,i)=>i===scheduled+4?-1:v):kind==='one'?Array(scheduled).fill(-1):scheduled===18?[-1,-1,0,1,1,0,-1,-2,-3,-4,-5,-5,-5,-5]:[-1,-1,0,1,1,0,-1,-1,-2,-3,-2,-3,-4,-3,-4,-5,-5,-5,-5];let prior=0;for(const [i,lead] of leads.entries()){if(matchState(s,'r0m0').winnerId)break;const delta=lead-prior,a=delta<0?5:4,b=delta>0?5:4;recordScores(s,'r0m0','a',i+1,a,b);recordScores(s,'r0m0','b',i+1,b,a);prior=lead;}return {...matchState(s,'r0m0'),scheduled};}

const DEFAULT_GRADE_RANGES=[{min:null,max:12},{min:13,max:18},{min:19,max:26},{min:27,max:36},{min:37,max:54}];
function followingGradeRanges(grades){let previous=null;return grades.map((grade,i)=>{const base=DEFAULT_GRADE_RANGES[(grade.number||i+1)-1],existing=grade.range;let range;if(grade.manual||grade.locked)range=existing?{...existing}:{...base};else{const min=i===0?null:previous?.max==null?null:previous.max+1;const max=min==null?base.max:Math.max(base.max,min);range={min,max};}previous=range;return range;});}


const PLAYOFF_ROUNDS=['Round of 16','Quarterfinals','Semifinals','Final'];
function playerJourney(s,playerId){
 if(!s.seats.includes(playerId))return {status:'not-entered',canScore:false};
 let lastWin=null;
 for(let r=0;r<4;r++)for(let m=0;m<8/2**r;m++){
  const key=keyFor(r,m),ids=opponents(s,key);if(!ids.includes(playerId))continue;
  const st=matchState(s,key),base={key,round:r,roundName:PLAYOFF_ROUNDS[r],players:ids,lastWin};
  if(st.accepted){if(st.winnerId!==playerId)return {...base,status:'eliminated',canScore:false};lastWin={key,round:r,nextRound:PLAYOFF_ROUNDS[r+1]||null};if(r===3)return {...base,lastWin,status:'champion',canScore:false};continue;}
  return {...base,status:st.winnerId?'confirmation':ids.every(Boolean)?'playing':'waiting',canScore:!!s.published&&ids.every(Boolean)&&!st.winnerId};
 }
 return {status:'waiting',canScore:false,lastWin,round:lastWin?lastWin.round+1:0,roundName:PLAYOFF_ROUNDS[lastWin?lastWin.round+1:0]};
}
function recordPlayerScores(s,playerId,key,hole,own,marked){
 const access=playerJourney(s,playerId);if(access.key!==key||(!access.canScore&&!(access.status==='confirmation'&&Number(hole)<=matchState(s,key).played)))throw Error('You can only score or correct your current match.');
 return recordScores(s,key,access.players[0]===playerId?'a':'b',hole,own,marked);
}

function handicapPossessive(player){
 const gender=String(player?.gender||player?.sex||'').trim().toLowerCase();
 if(['female','f','woman','women'].includes(gender))return 'Her';
 if(['male','m','man','men'].includes(gender))return 'His';
 return 'Your opponent’s';
}

function printDrawRounds(s){
 const openingComplete=Array.from({length:8},(_,m)=>s.matches[keyFor(0,m)]?.result).every(result=>!!result?.winnerId);
 return openingComplete?[1,2,3]:[0,1];
}

window.GolfMatchplay={DIVISIONS,scheduledForDivision,UNIVERSAL_INDEX,handicapped,parseHcp,formatHcp,validateIndex,matchHandicaps,holeStrokes,ORDER,ROUNDS,sampleDivision,getPlayer,keyFor,location,opponents,availableReserves,hasStarted,teeTime,courseHole,refereeMode,matchState,recordScores,concede,requestHoleConcession,confirmHoleConcession,markConcededStroke,confirmResult,walkover,withdraw,playerLabel,addReserve,reopen,validateSetup,importQualifiers,demo,copyDivision,joinReferee,finalMatchNo,ensureReferees,syncReferee,setReferee,assignCurrentReferee,visualExample,overviewWindow,ownScoreDiffers,extendedVisualExample,freezeQualifyingHandicaps,OATLANDS_CARD_INDEX,primaryClubIndex,gradeName,sampleGradeHandicaps,handicapRangeIssues,showCourseHole,scheduledVisualExample,DEFAULT_GRADE_RANGES,followingGradeRanges,PLAYOFF_ROUNDS,playerJourney,recordPlayerScores,handicapPossessive,printDrawRounds};
})();
