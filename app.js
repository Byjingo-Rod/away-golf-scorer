(()=>{
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const inactiveNames=new Set(['Denis Lenard','John Herbert','Rolly Nice']);
const NO_PARTNER_ID='system-no-partner';
const NO_PARTNER={id:NO_PARTNER_ID,name:'No Partner',golfLink:'',ga:'',rosterActive:true,system:true};
let roundWakeLock=null;
async function requestRoundWakeLock(){
 if(!('wakeLock' in navigator)||!['scoring','verify'].includes(store.event?.playerRoundMode)||document.visibilityState!=='visible')return false;
 try{if(!roundWakeLock||roundWakeLock.released)roundWakeLock=await navigator.wakeLock.request('screen');return true}catch(_){roundWakeLock=null;return false}
}
async function releaseRoundWakeLock(){try{if(roundWakeLock&&!roundWakeLock.released)await roundWakeLock.release()}catch(_){}roundWakeLock=null}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&['scoring','verify'].includes(store.event?.playerRoundMode))requestRoundWakeLock()});
const competitionNames={single:'Single Stableford',combined:'Single Stableford',fourball:'4BBB Stableford',teamPutts:'Putting Competition',best3of4:'Best 3 of 4 Stableford',par3:'Par 3 Competition',ntp:'Nearest the Pin',scratch:'Scratch',eclectic:'Eclectic'};
function competitionDisplayName(id){
 if(id==='teamPutts')return `Putting Competition (${store.event?.puttingFormat==='pairs'?'2 Player':'4 Player'})`;
 return competitionNames[id]||id;
}
function competitionBenefitText(id,benefits){
 const b=benefits?.[id]||{};
 if(id==='best3of4'&&b.mode==='lottery')return b.contribution?`Lottery Pool — $${b.contribution} per team member`:'Lottery Pool';
 const parts=[];if(b.balls)parts.push(`${b.balls} Ball${+b.balls===1?'':'s'}`);if(b.plus)parts.push('+ Prize');if(b.extra)parts.push(b.extra);
 return parts.join(' ')||'Prize not set';
}
const courseRegionByName={
 'Bathurst':'Orange & Central West','Duntryleague':'Orange & Central West','Mudgee':'Orange & Central West','Wentworth (Orange)':'Orange & Central West',
 'Cypress Lakes':'Hunter Valley','Hunter Valley G&CC':'Hunter Valley','The Vintage':'Hunter Valley','Horizons Golf Club':'Hunter & Newcastle','Kooindah Waters':'Hunter & Newcastle','Newcastle':'Hunter & Newcastle','Pacific Dunes':'Hunter & Newcastle','Nelson Bay Golf Club':'Hunter & Newcastle',
 'Kiama Golf Club':'Illawarra & South Coast','Links at Shell Cove':'Illawarra & South Coast','Mollymook GC':'Illawarra & South Coast','Moruya Golf Club':'Illawarra & South Coast','Narooma GC':'Illawarra & South Coast','Nowra Golf & Recreation Club':'Illawarra & South Coast','Port Kembla':'Illawarra & South Coast','Shoalhaven Heads Golf Club':'Illawarra & South Coast','The Grange':'Illawarra & South Coast','Wollongong':'Illawarra & South Coast',
 'Federal Golf Club':'Canberra','Gold Creek Golf Club':'Canberra','Gungahlin Lakes':'Canberra','Royal Canberra (West)':'Canberra','Royal Canberra (Yarra)':'Canberra'
};
function fresh(){return{players:AWAY_SEED.players.map(p=>({...p,rosterActive:!inactiveNames.has(p.name),homeClub:'',notes:'',eventsPlayed:0,lastEvent:''})),courses:AWAY_SEED.courses.map(c=>({...c,available:c.available!==false,address:'',phone:'',website:'',email:'',mapLink:'',notes:''})),event:null,template:null}}
let store;
try{store=JSON.parse(localStorage.getItem('awayGolf13')||'null')}catch(e){}
if(!store){store=fresh();try{const old=JSON.parse(localStorage.getItem('awayGolfV11')||'null');if(old?.players?.length){const map=new Map(old.players.map(p=>[p.id,p]));store.players=store.players.map(p=>({...p,...map.get(p.id),rosterActive:map.get(p.id)?.rosterActive??p.rosterActive}))}if(old?.courses?.length){const map=new Map(old.courses.map(c=>[c.id,c]));store.courses=store.courses.map(c=>({...c,...map.get(c.id),available:map.get(c.id)?.available??true}))}}catch(e){}}
try{store.template=JSON.parse(localStorage.getItem('awayGolfOrganiserTemplateV1')||'null')||store.template}catch(e){}
store.pairHistory=store.pairHistory||{};
store.partnerHistory=store.partnerHistory||{};
if(store.event?.name&&/this page appears and needs to be filled in even when one tee/i.test(store.event.name)){
  store.event.name=store.event.name.replace(/this page appears and needs to be filled in even when one tee/i,'').trim()||'Canberra';
}
// Development migration: an event locked in 14.x had no Daily Handicap step. Re-open it once so scoring setup can be completed.
if(store.event?.locked&&!store.event.dailyHandicaps){store.event.locked=false;store.event.status='planned';delete store.event.lockedAt;}

const save=()=>{localStorage.setItem('awayGolf13',JSON.stringify(store));renderHome();renderPlayersAdmin();renderCoursesAdmin()};
const surnameKey=n=>{let p=String(n).trim().split(/\s+/);return (p.pop()+' '+p.join(' ')).toLowerCase()};
const activePlayers=()=>store.players.filter(p=>p.rosterActive!==false).sort((a,b)=>surnameKey(a.name).localeCompare(surnameKey(b.name)));
const activeCourses=()=>store.courses.filter(c=>c.available!==false).sort((a,b)=>a.name.localeCompare(b.name));
const course=id=>store.courses.find(c=>c.id===id), player=id=>String(id)===NO_PARTNER_ID?NO_PARTNER:store.players.find(p=>String(p.id)===String(id));
const version=c=>c?.versions?.find(v=>v.id===c.activeVersionId)||c?.versions?.[0];
function ensureCourseData(c){
 c.address=c.address||'';c.phone=c.phone||'';c.website=c.website||'';c.email=c.email||'';c.mapLink=c.mapLink||'';c.notes=c.notes||'';c.region=c.region||courseRegionByName[c.name]||'';
 if(!c.teeDetails){const v=version(c)||{},par=(v.par||[]).reduce((x,y)=>x+(+y||0),0)||'',length=(v.metres||[]).reduce((x,y)=>x+(+y||0),0)||'';c.teeDetails={back:{name:'Back',colour:'Blue',slope:'',scratch:'',par:'',length:''},middle:{name:'Middle',colour:'White',slope:v.slope||'',scratch:v.scratch||'',par,length},front:{name:'Front',colour:'Yellow',slope:'',scratch:'',par:'',length:''}}}
}
store.courses.forEach(ensureCourseData);

let cloudReady=false,cloudBusy=false,cloudMessage='Connecting securely…',cloudChannel=null,cloudReloadTimer=null;
const cloudRoundTimers=new Map();
const isPlayerDevice=()=>store.cloud?.role==='player'&&Boolean(store.cloud?.eventId);
function applyDeviceRole(){
 document.body.classList.toggle('playerDevice',isPlayerDevice());
 if(isPlayerDevice()&&!['home','scorePage'].includes($('.page.active')?.id||''))nav('scorePage');
}
function cloudPlayerIds(){
 const ids=new Set((store.event?.confirmed||[]).map(String));
 Object.values(store.event?.groupSetup||{}).forEach(s=>(s?.groups||[]).flat().forEach(id=>{if(String(id)!==NO_PARTNER_ID)ids.add(String(id))}));
 return [...ids].filter(id=>player(id));
}
function cloudPayload(){
 const event=JSON.parse(JSON.stringify(store.event||{}));
 delete event.scoring;delete event.playerRoundMode;delete event.playerHolePos;delete event.playerPreviewId;delete event.playerPreviewDay;delete event.playerPreviewAck;delete event.playerRulesOpen;delete event.leaderboardTab;delete event.leaderboardView;delete event.liveControlDay;
 const players=cloudPlayerIds().map(id=>{const p=player(id);return{id:String(p.id),name:p.name,ga:p.ga??'',rosterActive:true,golfLink:'',homeClub:'',notes:''}});
 const courseIds=[event.course1,event.course2].filter(Boolean).map(String);
 const courses=store.courses.filter(c=>courseIds.includes(String(c.id))).map(c=>JSON.parse(JSON.stringify(c)));
 return{event,players,courses};
}
function cloudPlayerRows(){
 return cloudPlayerIds().map(id=>{const p=player(id);return{id:String(id),name:p.name,dailyHandicaps:{day1:playerDailyHandicap(id,1),day2:store.event?.days===2?playerDailyHandicap(id,2):null}}});
}
function setCloudMessage(message,busy=false){cloudMessage=message;cloudBusy=busy;renderCloudPanel()}
function applyRemoteCloud(bundle){
 const payload=bundle?.event?.event_data||{};
 if(store.cloud?.role==='player'&&payload.event){
   const localScoring=store.event?.scoring||{day1:{},day2:{}};
 const localUi={playerRoundMode:store.event?.playerRoundMode||'preview',playerHolePos:store.event?.playerHolePos||0,playerPreviewAck:store.event?.playerPreviewAck||{},leaderboardTab:store.event?.leaderboardTab||'',leaderboardView:store.event?.leaderboardView||''};
   store.event={...JSON.parse(JSON.stringify(payload.event)),...localUi,scoring:localScoring};
   (payload.players||[]).forEach(remote=>{const i=store.players.findIndex(p=>String(p.id)===String(remote.id));if(i>=0)store.players[i]={...store.players[i],...remote};else store.players.push({...remote})});
   (payload.courses||[]).forEach(remote=>{const i=store.courses.findIndex(c=>String(c.id)===String(remote.id));if(i>=0)store.courses[i]=remote;else store.courses.push(remote)});
   store.event.playerPreviewId=String(store.cloud.playerId);
 }
 (bundle?.scores||[]).forEach(row=>{scoringDayStore(+row.day)[String(row.scorer_player_id)]=row.score_data||{}});
 store.cloudPlayers=(bundle?.players||[]).map(row=>({playerId:String(row.player_id),name:row.display_name||'',joined:Boolean(row.joined_at),joinedAt:row.joined_at||null}));
 localStorage.setItem('awayGolf13',JSON.stringify(store));renderHome();
 if(document.querySelector('#scorePage.active'))renderPlayerExperience();
 if(document.querySelector('#leaderboardPage.active'))renderLeaderboard();
}
async function releaseCloudPlayer(playerId){
 if(store.cloud?.role!=='organiser'||!store.cloud?.eventId)return;
 const row=(store.cloudPlayers||[]).find(x=>String(x.playerId)===String(playerId));
 if(!confirm(`Release ${row?.name||'this player'}'s phone connection? They can then join again on another phone.`))return;
 setCloudMessage('Releasing player connection…',true);
 try{await AwayCloud.releasePlayer(store.cloud.eventId,playerId);cloudBusy=false;await syncCloudNow();setCloudMessage(`${row?.name||'Player'} can join again`)}
 catch(error){setCloudMessage('Release did not complete');alert('The player connection was not released. '+(error.message||error))}
}
async function syncCloudNow(){
 if(!store.cloud?.eventId||cloudBusy)return;
 setCloudMessage('Synchronising…',true);
 try{const bundle=await AwayCloud.loadEvent(store.cloud.eventId);applyRemoteCloud(bundle);setCloudMessage(`Live · updated ${new Date().toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'})}`)}
 catch(error){setCloudMessage(navigator.onLine?'Sync delayed — tap Retry':'Offline — scores remain saved on this phone')}
}
function watchCloudEvent(){
 if(!store.cloud?.eventId||cloudChannel)return;
 cloudChannel=AwayCloud.subscribe(store.cloud.eventId,()=>{clearTimeout(cloudReloadTimer);cloudReloadTimer=setTimeout(syncCloudNow,450)});
}
async function publishCloudEvent(){
 if(!store.event?.locked)return alert('Lock the event before publishing it to players.');
 setCloudMessage('Publishing event…',true);
 try{
   const payload=cloudPayload();
   const result=await AwayCloud.createEvent(store.event.name,payload,cloudPlayerRows());
   await AwayCloud.updateEvent(result.event_id,payload,store.event.status||'locked');
   store.cloud={role:'organiser',eventId:result.event_id,joinCode:result.join_code};
   localStorage.setItem('awayGolf13',JSON.stringify(store));watchCloudEvent();setCloudMessage('Published · ready for players');renderCloudPanel();
 }catch(error){setCloudMessage('Could not publish');alert('Publishing did not complete. '+(error.message||error))}
}
async function updateCloudEvent(){
 if(!store.cloud?.eventId||store.cloud.role!=='organiser')return;
 setCloudMessage('Updating event…',true);
 try{await AwayCloud.updateEvent(store.cloud.eventId,cloudPayload(),store.event?.status||'locked');setCloudMessage('Event update shared with players')}
 catch(error){setCloudMessage('Update delayed — tap Retry');alert('The cloud update did not complete. '+(error.message||error))}
}
async function lookupCloudEvent(){
 const code=String($('#joinCode')?.value||'').trim().toUpperCase();
 if(code.length!==6)return alert('Enter the six-character event code.');
 setCloudMessage('Finding event…',true);
 try{
   const rows=await AwayCloud.invitation(code);
   if(!rows.length){setCloudMessage('Ready');return alert('No current Away Golf event was found for that code.')}
   const available=rows.filter(r=>!r.already_joined);
   $('#modalContent').innerHTML=`<h2>Join ${esc(rows[0].event_name)}</h2><p>Select your own name. This links this phone to your score only.</p><label>Your name<select id="cloudJoinPlayer">${available.map(r=>`<option value="${esc(r.player_id)}">${esc(r.display_name)}</option>`).join('')}</select></label><div class="rowBtns" style="margin-top:14px"><button class="primary" id="confirmCloudJoin" ${available.length?'':'disabled'}>Join Event</button><button class="soft" id="cancelCloudJoin">Cancel</button></div>${available.length?'':'<p class="cloudWarning">Every player position has already been claimed. Ask the organiser for help.</p>'}`;
   $('#modalShade').classList.add('open');$('#cancelCloudJoin').onclick=()=>{$('#modalShade').classList.remove('open');setCloudMessage('Ready')};
   if(available.length)$('#confirmCloudJoin').onclick=async()=>{
     const playerId=$('#cloudJoinPlayer').value;$('#confirmCloudJoin').disabled=true;
     try{const eventId=await AwayCloud.joinEvent(code,playerId);store.cloud={role:'player',eventId,joinCode:code,playerId:String(playerId)};localStorage.setItem('awayGolf13',JSON.stringify(store));const bundle=await AwayCloud.loadEvent(eventId);applyRemoteCloud(bundle);applyDeviceRole();$('#modalShade').classList.remove('open');watchCloudEvent();setCloudMessage('Joined · live scoring connected');nav('scorePage')}
     catch(error){$('#confirmCloudJoin').disabled=false;alert('Joining did not complete. '+(error.message||error))}
   };
 }catch(error){setCloudMessage('Could not find event');alert('Event lookup did not complete. '+(error.message||error))}
}
function queueCloudRound(day,playerId){
 if(!store.cloud?.eventId)return;
 if(store.cloud.role==='player'&&String(store.cloud.playerId)!==String(playerId))return;
 const key=`${day}:${playerId}`;clearTimeout(cloudRoundTimers.get(key));setCloudMessage(navigator.onLine?'Score saved · syncing…':'Score saved on phone · offline');
 cloudRoundTimers.set(key,setTimeout(async()=>{
   try{await AwayCloud.saveRound(store.cloud.eventId,+day,String(playerId),JSON.parse(JSON.stringify(scorerStore(day,playerId))));cloudRoundTimers.delete(key);setCloudMessage('Live · score shared')}
   catch(_){setCloudMessage('Score saved on phone · sync will retry');cloudRoundTimers.set(key,setTimeout(()=>queueCloudRound(day,playerId),5000))}
 },500));
}
function renderCloudPanel(){
 const host=$('#cloudPanel'),head=$('#cloudHeader');if(!host||!head)return;
 head.textContent=cloudReady?(navigator.onLine?'Cloud connected':'Offline mode'):'Connecting…';head.classList.toggle('offline',!navigator.onLine);
 if(store.cloud?.role==='organiser'&&store.cloud.eventId){const connections=(store.cloudPlayers||[]).filter(x=>x.joined);host.innerHTML=`<div class="cloudPanelHead"><div><small>LIVE EVENT</small><h3>${esc(store.event?.name||'Away Golf Event')}</h3></div><span class="cloudState">${esc(cloudMessage)}</span></div><div class="joinCodeDisplay"><span>PLAYER JOIN CODE</span><b>${esc(store.cloud.joinCode||'——')}</b></div><div class="cloudActions"><button class="primary" id="updateCloudEvent" ${cloudBusy?'disabled':''}>Share Latest Event Changes</button><button class="soft" id="retryCloud" ${cloudBusy?'disabled':''}>Refresh Scores</button></div><div class="connectedPlayers"><div><b>Connected Players</b><span>${connections.length} of ${(store.cloudPlayers||[]).length} joined</span></div>${connections.map(x=>`<div class="connectedPlayer"><span><i></i>${esc(x.name)}</span><button class="soft" data-releaseplayer="${esc(x.playerId)}" ${cloudBusy?'disabled':''}>Release Phone</button></div>`).join('')||'<p class="hint">No players have joined yet.</p>'}</div>`;$('#updateCloudEvent').onclick=updateCloudEvent;$('#retryCloud').onclick=syncCloudNow;$$('[data-releaseplayer]').forEach(b=>b.onclick=()=>releaseCloudPlayer(b.dataset.releaseplayer));return}
 if(store.cloud?.role==='player'&&store.cloud.eventId){host.innerHTML=`<div class="cloudPanelHead"><div><small>JOINED AS</small><h3>${esc(player(store.cloud.playerId)?.name||'Player')}</h3></div><span class="cloudState">${esc(cloudMessage)}</span></div><p>Your phone is connected to <b>${esc(store.event?.name||'the Away Golf event')}</b>. Scores are saved locally first and shared automatically.</p><button class="primary" id="openMyCard">Open My Scorecard</button>`;$('#openMyCard').onclick=()=>nav('scorePage');return}
 host.innerHTML=`<div class="cloudPanelHead"><div><small>SHARED EVENT</small><h3>Connect players' phones</h3></div><span class="cloudState">${esc(cloudMessage)}</span></div>${store.event?.locked?'<button class="primary" id="publishCloudEvent">Publish Locked Event</button>':'<p class="hint">After Groups & Teams are complete and the event is locked, publish it here to receive the player join code.</p>'}<div class="joinEventRow"><input id="joinCode" maxlength="6" autocapitalize="characters" placeholder="6-character event code"><button class="soft" id="lookupCloudEvent" ${cloudBusy?'disabled':''}>Join an Event</button></div>`;
 if($('#publishCloudEvent'))$('#publishCloudEvent').onclick=publishCloudEvent;$('#lookupCloudEvent').onclick=lookupCloudEvent;
}
async function initialiseCloud(){
 try{await AwayCloud.ensureSignedIn();cloudReady=true;setCloudMessage('Secure connection ready');if(store.cloud?.eventId){await syncCloudNow();watchCloudEvent()}}
 catch(_){cloudReady=false;setCloudMessage('Offline — local scoring available')}
}
window.addEventListener('online',()=>{cloudReady=true;syncCloudNow();renderCloudPanel()});window.addEventListener('offline',renderCloudPanel);

function renderHome(){ $('#homeEvent').textContent=store.event?.name||'Not set';$('#homePlayers').textContent=store.event?.confirmed?.length||0;applyDeviceRole();renderCloudPanel();renderLiveEventControl() }
function nav(id){if(isPlayerDevice()&&!['home','scorePage','leaderboardPage'].includes(id))id='scorePage';$$('.page').forEach(x=>x.classList.toggle('active',x.id===id));$$('nav button').forEach(x=>x.classList.toggle('active',x.dataset.nav===id));if(id==='teamsPage')renderTeamsPage();if(id==='scorePage')renderPlayerExperience();if(id==='leaderboardPage')renderLeaderboard()}
$$('nav button').forEach(b=>b.onclick=()=>nav(b.dataset.nav));
function showSide(html){$('#sideContent').innerHTML=html;$('#sidePanel').classList.add('open')}$('#closeSide').onclick=()=>$('#sidePanel').classList.remove('open');
function playerInfo(id,status=''){let p=player(id);showSide(`<h2>${esc(p.name)}</h2><p><small>GOLFLINK NUMBER</small><br><b>${esc(p.golfLink||'—')}</b></p><p><small>GA HANDICAP</small><br><b>${Number(p.ga||0).toFixed(1)}</b></p><p><small>HOME CLUB</small><br><b>${esc(p.homeClub||'—')}</b></p><p><small>LAST AWAY GOLF EVENT</small><br><b>${esc(p.lastEvent||'—')}</b></p><p><small>EVENTS PLAYED</small><br><b>${p.eventsPlayed||0}</b></p><p><small>NOTES</small><br>${esc(p.notes||'—')}</p><p><small>STATUS</small><br><b>${p.rosterActive===false?'Inactive':'Active'}${status?' • '+status:''}</b></p>`)}
function renderPlayersAdmin(){let q=($('#playerSearchMain').value||'').toLowerCase(), ps=[...store.players].filter(p=>(p.name+' '+p.golfLink).toLowerCase().includes(q)).sort((a,b)=>surnameKey(a.name).localeCompare(surnameKey(b.name))), act=ps.filter(p=>p.rosterActive!==false), ina=ps.filter(p=>p.rosterActive===false);let ret=wizardReturnStep?`<div class="returnSetupBar"><button class="soft" id="returnToWizardPlayers">← Return to Setup</button></div>`:'';$('#playerAdminList').innerHTML=ret+act.map(p=>`<div class="playerRow"><div><b>${esc(p.name)}</b><small>${esc(p.golfLink)}</small></div><div class="rowBtns"><button class="info" data-pinfo="${p.id}">i</button><button class="danger" data-pinactive="${p.id}">−</button></div></div>`).join('')+(ina.length?`<div class="divider">Inactive Away Golf Members (${ina.length})</div>`+ina.map(p=>`<div class="playerRow inactive"><div><b>${esc(p.name)}</b><small>${esc(p.golfLink)}</small></div><div class="rowBtns"><button class="info" data-pinfo="${p.id}">i</button><button class="soft" data-preactivate="${p.id}">Reactivate</button></div></div>`).join(''):'')}
$('#playerSearchMain').oninput=renderPlayersAdmin;$('#addPlayerTop').onclick=addPlayer;
function addPlayer(){let name=prompt('Player name');if(!name)return null;let gl=prompt('GolfLink number')||'';let id='p'+uid();store.players.push({id,name,golfLink:gl,ga:0,rosterActive:true,homeClub:'',notes:'',eventsPlayed:0,lastEvent:''});save();return id}
function courseDetail(id){
 let c=course(id);if(!c)return;ensureCourseData(c);let v=version(c)||{},t=c.teeDetails;
 store.courseFavourites=store.courseFavourites||[];const isFavourite=store.courseFavourites.map(String).includes(String(c.id));
 const nineRows=(first,last)=>Array.from({length:last-first+1},(_,j)=>{let i=first-1+j;return`<tr><td>${i+1}</td><td><input type="number" min="3" max="6" id="scPar${i}" value="${v.par?.[i]??''}"></td><td><input type="text" maxlength="8" id="scIdx${i}" value="${esc(v.index?.[i]??'')}"></td><td><input type="number" min="0" max="999" id="scMet${i}" value="${v.metres?.[i]??''}"></td></tr>`}).join('');
 const scoreTable=(first,last,label)=>`<table class="scoreNine"><thead><tr><th colspan="4">${label}</th></tr><tr><th class="holeCol">Hole</th><th class="parCol">Par</th><th class="indexCol">Index</th><th class="lengthCol">Length</th></tr></thead><tbody>${nineRows(first,last)}</tbody></table>`;
 const teeRow=(key,label,colour)=>`<tr><td><b>${label}</b><br><small>${colour}</small></td><td><input id="${key}Slope" value="${esc(t[key]?.slope||'')}"></td><td><input id="${key}Scratch" value="${esc(t[key]?.scratch||'')}"></td><td><input id="${key}Par" value="${esc(t[key]?.par||'')}"></td><td><input id="${key}Length" value="${esc(t[key]?.length||'')}"></td></tr>`;
 $('#modalContent').innerHTML=`<div class="courseDetailTop"><h2>Course Details — ${esc(c.name)}</h2><label class="favDetailToggle"><input type="checkbox" id="courseFavourite" ${isFavourite?'checked':''}> Add Course to Favourites</label></div><div class="modalGrid"><label>Name<input id="mcname" value="${esc(c.name)}"></label><label>Golf Region<input id="mcregion" value="${esc(c.region||'')}" placeholder="e.g. Hunter Valley"></label><label>Pro Shop phone<input id="mcphone" value="${esc(c.phone||'')}"></label><label>Address / location<input id="mcaddress" value="${esc(c.address||'')}"></label><label>Google Maps link<input id="mcmap" value="${esc(c.mapLink||'')}"></label><label>Website<input id="mcweb" value="${esc(c.website||'')}"></label><label>Email<input id="mcemail" value="${esc(c.email||'')}"></label></div><label>Notes<textarea id="mcnotes" rows="4" placeholder="Course condition, greens cored, booking or clubhouse notes...">${esc(c.notes||'')}</textarea></label><h3>Tee Details</h3><table class="teeTable"><thead><tr><th>Tee</th><th>Slope</th><th>Scratch</th><th>Par</th><th>Length (m)</th></tr></thead><tbody>${teeRow('back','Back','Blue')}${teeRow('middle','Middle','White')}${teeRow('front','Front','Yellow')}</tbody></table><h3>Scorecard — active tee</h3><div class="scoreMini"><div class="scoreNineWrap">${scoreTable(1,9,'Front Nine')}${scoreTable(10,18,'Back Nine')}</div></div><div class="rowBtns" style="margin-top:12px"><button class="primary" id="saveCourseModal">Save Course Details</button>${c.mapLink?`<button class="soft" id="openMapLink">Open Map</button>`:''}<button class="soft" id="closeModal">Close</button></div>`;
 $('#modalShade').classList.add('open');$('#closeModal').onclick=()=>$('#modalShade').classList.remove('open');if($('#openMapLink'))$('#openMapLink').onclick=()=>window.open(c.mapLink,'_blank','noopener');
 $('#courseFavourite').onchange=e=>{const ids=store.courseFavourites.map(String),i=ids.indexOf(String(c.id));if(e.target.checked&&i<0)store.courseFavourites.push(String(c.id));if(!e.target.checked&&i>=0)store.courseFavourites.splice(i,1);localStorage.setItem('awayGolf13',JSON.stringify(store))};
 $('#saveCourseModal').onclick=()=>{c.name=$('#mcname').value.trim()||c.name;c.region=$('#mcregion').value.trim();c.phone=$('#mcphone').value.trim();c.address=$('#mcaddress').value.trim();c.mapLink=$('#mcmap').value.trim();c.website=$('#mcweb').value.trim();c.email=$('#mcemail').value.trim();c.notes=$('#mcnotes').value.trim();for(const key of ['back','middle','front']){c.teeDetails[key]=c.teeDetails[key]||{};c.teeDetails[key].slope=$('#'+key+'Slope').value.trim();c.teeDetails[key].scratch=$('#'+key+'Scratch').value.trim();c.teeDetails[key].par=$('#'+key+'Par').value.trim();c.teeDetails[key].length=$('#'+key+'Length').value.trim()}if(!v.par)v.par=Array(18).fill('');if(!v.index)v.index=Array(18).fill('');if(!v.metres)v.metres=Array(18).fill('');for(let i=0;i<18;i++){v.par[i]=+$('#scPar'+i).value||'';v.index[i]=$('#scIdx'+i).value.trim();v.metres[i]=+$('#scMet'+i).value||''}v.slope=c.teeDetails.middle.slope;v.scratch=c.teeDetails.middle.scratch;v.teeName='Middle';save();$('#modalShade').classList.remove('open')}
}
function renderCoursesAdmin(){
 let q=($('#courseSearchMain').value||'').toLowerCase(),cs=[...store.courses].filter(c=>c.name.toLowerCase().includes(q)).sort((x,y)=>x.name.localeCompare(y.name)),act=cs.filter(c=>c.available!==false),ina=cs.filter(c=>c.available===false);
 let row=c=>{ensureCourseData(c);let v=version(c)||{},t=c.teeDetails.middle||{},scoreKnown=(v.metres||[]).some(Boolean),contactKnown=Boolean(c.phone||c.address||c.website||c.mapLink),status=scoreKnown&&contactKnown?'Details recorded':scoreKnown||contactKnown?'Details partly recorded':'Details to complete';return`<div class="courseRow ${c.available===false?'inactive':''}"><div><b>${esc(c.name)}</b><small>Middle / White — Slope ${esc(t.slope||v.slope||'—')} • Par ${esc(t.par||'—')} • Length ${t.length?esc(t.length)+' m':'—'}</small><small>${c.region?esc(c.region)+' • ':''}${c.address?esc(c.address):'Location not yet entered'}${c.phone?' • Pro Shop '+esc(c.phone):''}</small><span class="courseStatus">${status}</span>${c.notes?`<small>${esc(c.notes)}</small>`:''}</div><div class="rowBtns"><button class="soft" data-cinfo="${c.id}">Course Details</button>${c.available===false?`<button class="soft" data-creactivate="${c.id}">Reactivate</button>`:`<button class="danger" data-cinactive="${c.id}">−</button>`}</div></div>`};
 let ret=wizardReturnStep?`<div class="returnSetupBar"><button class="soft" id="returnToWizardCourses">← Return to Setup</button></div>`:'';$('#courseAdminList').innerHTML=ret+act.map(row).join('')+(ina.length?`<div class="divider">Inactive Courses (${ina.length})</div>`+ina.map(row).join(''):'')
}

$('#courseSearchMain').oninput=renderCoursesAdmin;$('#addCourseTop').onclick=()=>addCourse(false);
function addCourse(returnId){let name=prompt('Club / Course name');if(!name)return null;let id='c'+uid(),v={id:'v'+uid(),teeName:'Middle',slope:'',scratch:'',par:[4,4,3,5,4,3,4,4,5,4,3,4,5,4,4,3,5,4],index:[9,3,15,1,7,17,11,5,13,8,16,10,2,12,6,18,4,14],metres:Array(18).fill('')};let c={id,name,available:true,address:'',phone:'',website:'',email:'',mapLink:'',notes:'',versions:[v],activeVersionId:v.id,teeDetails:{back:{name:'Back',colour:'Blue',slope:'',scratch:'',par:'',length:''},middle:{name:'Middle',colour:'White',slope:'',scratch:'',par:'',length:''},front:{name:'Front',colour:'Yellow',slope:'',scratch:'',par:'',length:''}}};store.courses.push(c);save();return id}

document.addEventListener('click',e=>{let t=e.target;if(t.id==='returnToWizardCourses'||t.id==='returnToWizardPlayers'){nav('homePage');$('#wizardShade').classList.add('open');W.step=wizardReturnStep||1;renderWizard();wizardReturnStep=null;return;}if(t.dataset.pinfo)playerInfo(t.dataset.pinfo);if(t.dataset.pinactive){let p=player(t.dataset.pinactive);if(confirm(`Make ${p.name} inactive?`)){p.rosterActive=false;save()}}if(t.dataset.preactivate){player(t.dataset.preactivate).rosterActive=true;save()}if(t.dataset.cinfo)courseDetail(t.dataset.cinfo);if(t.dataset.cinactive){let c=course(t.dataset.cinactive);if(confirm(`Make ${c.name} inactive?`)){c.available=false;save()}}if(t.dataset.creactivate){course(t.dataset.creactivate).available=true;save()}});

let wizardReturnStep=null;
let W={step:1,event:{},invites:new Map(),competitions:new Set(),benefits:{},benefitOpen:new Set()};
const stepNames=['Event details','Select players','Competition setup','Special rules','NTP setup','Review and Move to Scoring'];
function openWizard(){W={step:1,event:{name:'',date:new Date().toISOString().slice(0,10),days:1,startMethod:'single',startMethods:{day1:'single',day2:'single'},startHoles:{day1:[1],day2:[1]},fieldSize:8,course1:activeCourses()[0]?.id||'',course2:activeCourses()[0]?.id||'',twoTeeStarts:{day1:[1,10],day2:[1,10]},puttingFormat:'team',preferredLies:false,preferredLiesArea:'general',specialRules:'',dayAvailability:{}},invites:new Map(),competitions:new Set(),benefits:{},benefitOpen:new Set()};loadTemplate();$('#wizardShade').classList.add('open');renderWizard()}
function reopenEventPlan(){
 if(!store.event)return openWizard();
 const e=JSON.parse(JSON.stringify(store.event));
 W={step:6,event:e,invites:new Map(),competitions:new Set(e.competitions||[]),benefits:JSON.parse(JSON.stringify(e.benefits||{})),benefitOpen:new Set()};
 (e.confirmed||[]).forEach(id=>W.invites.set(String(id),'accepted'));
 W.event.dayAvailability=W.event.dayAvailability||{};
 $('#wizardShade').classList.add('open');
 nav('homePage');
 renderWizard();
}
$('#newEvent').onclick=openWizard;$('#cancelWizard').onclick=()=>$('#wizardShade').classList.remove('open');$('#backWizard').onclick=()=>{if(W.step>1){W.step--;renderWizard()}};$('#nextWizard').onclick=()=>{if(!validateStep())return;if(W.step<6){W.step++;renderWizard()}else finishEvent()};
function loadTemplate(){let t=store.template;if(!t)return;W.competitions=new Set(t.competitions||[]);W.benefits=JSON.parse(JSON.stringify(t.benefits||{}));W.event.puttingFormat=t.puttingFormat||'team';W.event.par3Format=(t.par3Format==='day2pair'?'aggregate':(t.par3Format==='day1'||t.par3Format==='day2'?'daily':(t.par3Format||'daily')));W.event.ntpDay2Count=t.ntpDay2Count||2}
function wizardDayPlayers(day){
 const accepted=[...W.invites.entries()].filter(([id,s])=>s==='accepted').map(([id])=>String(id));
 return accepted.filter(id=>{
   const a=W.event.dayAvailability?.[id];
   if(W.event.days===1)return true;
   return a?Boolean(a[day]):true;
 });
}
function startMethodFor(e,day){
 const m=e?.startMethods?.['day'+day]||e?.startMethod||'single';
 return ['single','two','shotgun'].includes(m)?m:'single';
}
function startHolesFor(e,day){
 const key='day'+day,m=startMethodFor(e,day);
 if(m==='two'){
   const a=e?.startHoles?.[key]||e?.twoTeeStarts?.[key]||[1,10];
   return [+(a[0]||1), +(a[1]||10)];
 }
 if(m==='single'){
   const a=e?.startHoles?.[key]||[1];
   return [+(a[0]||1)];
 }
 return [];
}
function validateStep(){
 if(W.step===1){
   syncEventFields();
   if(!W.event.name)return alert('Please enter an event name.');
   if(!W.event.course1)return alert('Please select a Day 1 course.');
   if(W.event.days===2&&!W.event.course2)return alert('Please select a Day 2 course.');
   for(let day=1;day<=W.event.days;day++){
     const m=startMethodFor(W.event,day),h=startHolesFor(W.event,day);
     if(m==='single'&&!h[0])return alert(`Please select the Day ${day} starting tee.`);
     if(m==='two'&&(+h[0]===+h[1]))return alert(`Day ${day} needs two different starting tees.`);
   }
 }
 if(W.step===2){
   const need=+W.event.fieldSize||0,d1=wizardDayPlayers(1),d2=W.event.days===2?wizardDayPlayers(2):[];
   if(d1.length<need)return alert(`Day 1 needs ${need} players. You currently have ${d1.length}.`);
   if(W.event.days===2&&d2.length<need)return alert(`Day 2 needs ${need} players. You currently have ${d2.length}.`);
   if(d1.filter(x=>x===NO_PARTNER_ID).length>1||d2.filter(x=>x===NO_PARTNER_ID).length>1)return alert('Only one No Partner position can be used on a day.');
 }
 return true
}
function renderWizard(){let spans=$$('.steps span');spans.forEach((s,i)=>s.classList.toggle('on',i===W.step-1));$('#stepText').textContent=`Step ${W.step} of 6 — ${stepNames[W.step-1]}`;$('#backWizard').style.visibility=W.step===1?'hidden':'visible';$('#nextWizard').style.display=W.step===6?'none':'';$('#nextWizard').textContent='Next';({1:renderStep1,2:renderStep2,3:renderStep3,4:renderStep4,5:renderStep5,6:renderStep6}[W.step])()}
function courseOptions(sel){return activeCourses().map(c=>`<option value="${c.id}" ${c.id===sel?'selected':''}>${esc(c.name)}</option>`).join('')}
function courseChoiceControl(day){
 const selected=course(W.event['course'+day]);
 return `<div class="courseChoiceControl"><select id="weC${day}" class="courseNativeSelect" aria-hidden="true" tabindex="-1">${courseOptions(W.event['course'+day])}</select><button type="button" class="courseChoiceBtn" id="chooseCourse${day}"><span><small>SELECTED COURSE</small><b>${esc(selected?.name||'Choose a course')}</b>${selected?.region?`<em>${esc(selected.region)}</em>`:''}</span><strong>Choose Course ›</strong></button></div>`;
}
function openCoursePicker(day){
 syncEventFields();store.courseFavourites=store.courseFavourites||[];
 const chosenKey='course'+day,source=day===2?course(W.event.course1):null;
 const draw=()=>{
   const query=($('#coursePickerSearch')?.value||'').trim().toLowerCase();
   const all=activeCourses().filter(c=>!query||(c.name+' '+(c.region||'')).toLowerCase().includes(query));
   const favIds=new Set(store.courseFavourites.map(String));
   const favourites=activeCourses().filter(c=>favIds.has(String(c.id)));
   const nearby=source?.region?activeCourses().filter(c=>c.id!==source.id&&c.region===source.region):[];
   const quick=(c,label='')=>`<button type="button" class="courseQuickBtn" data-pickcourse="${c.id}"><b>${esc(c.name)}</b>${label?`<small>${esc(label)}</small>`:(c.region?`<small>${esc(c.region)}</small>`:'')}</button>`;
   $('#modalContent').innerHTML=`<div class="coursePickerHead"><div><h2>Choose Day ${day} Course</h2><p>${day===2&&source?`Day 1 is ${esc(source.name)}${source.region?` in ${esc(source.region)}`:''}.`:'Choose with the mouse from All Courses or your Favourites.'}</p></div><button type="button" class="close" id="closeCoursePicker">×</button></div><div class="coursePickerGrid"><section class="courseAll"><label>Search all courses<input id="coursePickerSearch" value="${esc(query)}" placeholder="Course or golf region"></label><div class="coursePickerList">${all.map(c=>`<div class="coursePickerRow"><button type="button" class="courseNamePick" data-pickcourse="${c.id}"><b>${esc(c.name)}</b>${c.region?`<small>${esc(c.region)}</small>`:''}</button><button type="button" class="courseFavToggle ${favIds.has(String(c.id))?'on':''}" data-favcourse="${c.id}" title="${favIds.has(String(c.id))?'Remove from Favourites':'Add to Favourites'}">${favIds.has(String(c.id))?'✓':'＋'}</button></div>`).join('')||'<p class="hint">No courses match that search.</p>'}</div></section><aside class="courseQuick"><div class="quickSection"><h3>Favourites</h3><p>Your regular courses</p>${favourites.map(c=>quick(c)).join('')||'<div class="quickEmpty">Use the + beside any course to build this list.</div>'}</div>${day===2&&source?.region?`<div class="quickSection nearby"><h3>Nearby Courses</h3><p>${esc(source.region)}</p>${nearby.map(c=>quick(c,'Same golf region')).join('')||'<div class="quickEmpty">No other course is assigned to this region yet.</div>'}</div>`:''}</aside></div>`;
   $('#closeCoursePicker').onclick=()=>$('#modalShade').classList.remove('open');
   $('#coursePickerSearch').oninput=draw;
   if(query){const search=$('#coursePickerSearch');search.focus();search.setSelectionRange(query.length,query.length)}
   $$('[data-pickcourse]').forEach(b=>b.onclick=()=>{W.event[chosenKey]=b.dataset.pickcourse;if(day===1&&W.event.days===2&&!W.event.course2)W.event.course2=b.dataset.pickcourse;$('#modalShade').classList.remove('open');renderStep1()});
   $$('[data-favcourse]').forEach(b=>b.onclick=()=>{const id=String(b.dataset.favcourse),i=store.courseFavourites.map(String).indexOf(id);if(i>=0)store.courseFavourites.splice(i,1);else store.courseFavourites.push(id);localStorage.setItem('awayGolf13',JSON.stringify(store));draw()});
 };
 $('#modalShade').classList.add('open');draw();
}
function holeOptions(selected){
 return Array.from({length:18},(_,i)=>`<option value="${i+1}" ${+selected===i+1?'selected':''}>Hole ${i+1}</option>`).join('')
}
function startFormatOptions(selected){
 return `<option value="single" ${selected==='single'?'selected':''}>Single Tee</option><option value="two" ${selected==='two'?'selected':''}>Two Tees</option><option value="shotgun" ${selected==='shotgun'?'selected':''}>Shotgun</option>`
}
function dayStartControls(day){
 const m=startMethodFor(W.event,day),holes=startHolesFor(W.event,day);
 if(m==='shotgun')return `<div class="startHoleNote">Starting holes for each group will be assigned on the Groups &amp; Teams page.</div>`;
 if(m==='two')return `<div class="twoTeeSetup"><div><label>Starting Tee 1</label><select id="weD${day}T1">${holeOptions(holes[0])}</select></div><div><label>Starting Tee 2</label><select id="weD${day}T2">${holeOptions(holes[1])}</select></div><p>Choose the actual two starting holes for this day.</p></div>`;
 return `<div class="singleTeeSetup"><label>Starting Tee</label><select id="weD${day}T1">${holeOptions(holes[0])}</select><p>Confirm the hole from which the field will start. Change it here if the club moves the start on the day.</p></div>`;
}
function renderStep1(){
 W.event.startMethods=W.event.startMethods||{day1:W.event.startMethod||'single',day2:W.event.startMethod||'single'};
 W.event.startHoles=W.event.startHoles||{day1:startHolesFor(W.event,1),day2:startHolesFor(W.event,2)};
 $('#wizardBody').innerHTML=`<h3>Event details</h3>
 <label>Event name<input id="weName" value="${esc(W.event.name)}" placeholder="e.g. Hunter Valley Weekend"></label>
 <div class="grid3">
   <div class="field"><label>Start date</label><input id="weDate" type="date" value="${W.event.date}"></div>
   <div class="field"><label>Event length</label><select id="weDays"><option value="1" ${W.event.days==1?'selected':''}>One day</option><option value="2" ${W.event.days==2?'selected':''}>Two days</option></select></div>
   <div class="field"><label>Size of Field</label><div class="fieldSizeStepper" role="group" aria-label="Size of Field"><button type="button" id="weFieldMinus" aria-label="Reduce field size">−</button><input id="weField" type="number" inputmode="numeric" min="1" max="60" value="${W.event.fieldSize}" aria-label="Number of players"><button type="button" id="weFieldPlus" aria-label="Increase field size">+</button></div></div>
 </div>
 <div class="daySetupCard">
   <div class="daySetupHead"><b>Day 1</b><span>Course and starting arrangement</span></div>
   <label>Day 1 course</label><div class="courseSelectRow">${courseChoiceControl(1)}<button class="soft" id="weC1Details">Course Details</button></div>
   <div class="dayStartFormat"><label>Day 1 Start Format</label><select id="weStart1">${startFormatOptions(startMethodFor(W.event,1))}</select></div>
   <div id="day1StartControls">${dayStartControls(1)}</div>
 </div>
 <div id="day2wrap" class="daySetupCard" style="${W.event.days==2?'':'display:none'}">
   <div class="daySetupHead"><b>Day 2</b><span>Course and starting arrangement</span></div>
   <label>Day 2 course</label><div class="courseSelectRow">${courseChoiceControl(2)}<button class="soft" id="weC2Details">Course Details</button></div>
   <div class="dayStartFormat"><label>Day 2 Start Format</label><select id="weStart2">${startFormatOptions(startMethodFor(W.event,2))}</select></div>
   <div id="day2StartControls">${dayStartControls(2)}</div>
 </div>
 <div class="rowBtns" style="margin-top:12px"><button class="soft" id="wizardAddCourse">+ Add Club / Course</button><button class="soft" id="wizardManageCourses">Manage Club / Course List</button></div>
 <div class="status">✓ Each day's course and starting arrangement are set independently.</div>`;
 $('#weName').focus();
 const changeFieldSize=delta=>{const input=$('#weField');input.value=Math.max(1,Math.min(60,(+input.value||8)+delta));W.event.fieldSize=+input.value};
 $('#weFieldMinus').onclick=()=>changeFieldSize(-1);
 $('#weFieldPlus').onclick=()=>changeFieldSize(1);
 ['weName','weDate','weDays','weField','weC1','weC2','weStart1','weStart2','weD1T1','weD1T2','weD2T1','weD2T2'].forEach(id=>{let x=$('#'+id);if(x)x.onchange=()=>{syncEventFields();if(id==='weDays'||id==='weStart1'||id==='weStart2')renderStep1()}});
 $('#weC1Details').onclick=()=>{syncEventFields();courseDetail(W.event.course1)};
 if($('#weC2Details'))$('#weC2Details').onclick=()=>{syncEventFields();courseDetail(W.event.course2)};
 $('#chooseCourse1').onclick=()=>openCoursePicker(1);
 if($('#chooseCourse2'))$('#chooseCourse2').onclick=()=>openCoursePicker(2);
 $('#wizardAddCourse').onclick=()=>{syncEventFields();wizardReturnStep=1;$('#wizardShade').classList.remove('open');nav('coursesPage');addCourse()};
 $('#wizardManageCourses').onclick=()=>{syncEventFields();wizardReturnStep=1;$('#wizardShade').classList.remove('open');nav('coursesPage');renderCoursesAdmin()};
}
function syncEventFields(){
 if(!$('#weName'))return;
 W.event.name=$('#weName').value.trim();W.event.date=$('#weDate').value;W.event.days=+$('#weDays').value;W.event.fieldSize=+$('#weField').value||8;
 W.event.course1=$('#weC1').value;W.event.course2=$('#weC2')?.value||W.event.course1;
 W.event.startMethods=W.event.startMethods||{day1:'single',day2:'single'};
 W.event.startHoles=W.event.startHoles||{day1:[1],day2:[1]};
 if($('#weStart1'))W.event.startMethods.day1=$('#weStart1').value;
 if($('#weStart2'))W.event.startMethods.day2=$('#weStart2').value;
 for(let day=1;day<=2;day++){
   const m=startMethodFor(W.event,day),a=$('#weD'+day+'T1'),b=$('#weD'+day+'T2');
   if(m==='two'&&a&&b)W.event.startHoles['day'+day]=[+a.value,+b.value];
   else if(m==='single'&&a)W.event.startHoles['day'+day]=[+a.value];
   else if(m==='shotgun')W.event.startHoles['day'+day]=[];
 }
 W.event.startMethod=W.event.startMethods.day1;
 W.event.twoTeeStarts={day1:startHolesFor(W.event,1),day2:startHolesFor(W.event,2)};
}
function renderStep2(){
 let q='';
 let keepSearchFocus=$('#wpSearch')===document.activeElement;
 let playerScroll={body:$('#wizardBody')?.scrollTop||0,av:$('#av')?.scrollTop||0,inv:$('#inv')?.scrollTop||0,conf:$('#conf')?.scrollTop||0};
 const rememberScroll=()=>{if($('#av'))playerScroll={body:$('#wizardBody')?.scrollTop||0,av:$('#av')?.scrollTop||0,inv:$('#inv')?.scrollTop||0,conf:$('#conf')?.scrollTop||0}};
 const restoreScroll=()=>{if($('#wizardBody'))$('#wizardBody').scrollTop=playerScroll.body;if($('#av'))$('#av').scrollTop=playerScroll.av;if($('#inv'))$('#inv').scrollTop=playerScroll.inv;if($('#conf'))$('#conf').scrollTop=playerScroll.conf};
 function ensureAvailability(id){
   id=String(id);
   W.event.dayAvailability=W.event.dayAvailability||{};
   if(!W.event.dayAvailability[id])W.event.dayAvailability[id]={1:true,2:true};
 }
 function draw(){
  rememberScroll();
  let normal=activePlayers().filter(p=>(p.name+' '+p.golfLink).toLowerCase().includes(q));
  let systemMatches=('no partner').includes(q)||q===''?[NO_PARTNER]:[];
  let ps=[...normal,...systemMatches];
  let available=ps.filter(p=>!W.invites.has(String(p.id)));
  let invitedIds=[...W.invites.keys()];
  let invited=invitedIds.map(id=>player(id)).filter(Boolean);
  let confirmed=invited.filter(p=>W.invites.get(String(p.id))==='accepted');
  confirmed.forEach(p=>ensureAvailability(p.id));
  let inactive=store.players.filter(p=>p.rosterActive===false).sort((x,y)=>surnameKey(x.name).localeCompare(surnameKey(y.name)));
  const d1=confirmed.filter(p=>W.event.days===1||W.event.dayAvailability?.[String(p.id)]?.[1]!==false);
  const d2=W.event.days===2?confirmed.filter(p=>W.event.dayAvailability?.[String(p.id)]?.[2]!==false):[];
  const need=+W.event.fieldSize||0;
  const complete=W.event.days===1?d1.length>=need:(d1.length>=need&&d2.length>=need);
  const status=W.event.days===1
    ?(complete?`✅ Field complete — ${d1.length} players confirmed.`:`${d1.length} confirmed — ${Math.max(0,need-d1.length)} places still to fill.`)
    :(complete?`✅ Field complete — Day 1: ${d1.length} players · Day 2: ${d2.length} players.`:`Day 1: ${d1.length}/${need} · Day 2: ${d2.length}/${need}`);
  $('#wizardBody').innerHTML=`<div class="pageHead"><div><h3>Choose players</h3><p class="hint">Invite golfers, record their response and build the confirmed field.</p></div><div class="card targetCard"><b>${W.event.fieldSize}</b><small>TARGET FIELD</small></div></div>
  <div class="playerTools"><input id="wpSearch" placeholder="Search by name or GolfLink number"><div class="rowBtns"><button class="soft" id="wizardManagePlayers">Manage Player List</button><button class="primary" id="wizardAddPlayer">+ Add Player</button></div></div>
  <div class="trafficLegend"><span><i class="legendDot accept"></i>Accepted</span><span><i class="legendDot wait"></i>Awaiting reply</span><span><i class="legendDot decline"></i>Declined</span>${W.event.days===2?`<span class="availabilityLegend">For accepted players, tick the day(s) they are playing.</span>`:''}</div>
  <div class="threeCols"><div class="col"><h3>Available Players <span>${available.length}</span></h3><div id="av"></div></div><div class="col"><h3>Invited <span>${invited.length}</span></h3><div id="inv"></div></div><div class="col"><h3>Confirmed Field <span>${confirmed.length}</span></h3><div id="conf"></div></div></div><div class="status">${status}</div>`;
  $('#wpSearch').value=q;
  if(keepSearchFocus){try{$('#wpSearch').focus({preventScroll:true});$('#wpSearch').setSelectionRange(q.length,q.length)}catch(_){}}
  $('#wpSearch').oninput=e=>{q=e.target.value.toLowerCase();keepSearchFocus=true;draw()};
  $('#wizardAddPlayer').onclick=()=>{let id=addPlayer();if(id){q='';draw()}};
  $('#wizardManagePlayers').onclick=()=>{wizardReturnStep=2;$('#wizardShade').classList.remove('open');nav('playersPage');renderPlayersAdmin()};
  $('#av').innerHTML=available.map(p=>p.system
    ?`<div class="playerRow noPartnerRow"><div><b>${esc(p.name)}</b><small>Use only when one playing position cannot be filled</small></div><button class="invite" data-winvite="${p.id}">Invite</button></div>`
    :`<div class="playerRow"><div><b>${esc(p.name)}</b><small>${esc(p.golfLink)}</small></div><div class="rowBtns"><button class="info" data-wpinfo="${p.id}">i</button><button class="invite" data-winvite="${p.id}">Invite</button><button class="danger miniMinus" title="Make inactive" data-wpinactive="${p.id}">−</button></div></div>`).join('')
   +(inactive.length?`<div class="divider">Inactive Away Golf Members (${inactive.length})</div>`+inactive.map(p=>`<div class="playerRow inactive"><div><b>${esc(p.name)}</b><small>${esc(p.golfLink)}</small></div><div class="rowBtns"><button class="info" data-wpinfo="${p.id}">i</button><button class="soft" data-wpreactivate="${p.id}">Reactivate</button></div></div>`).join(''):'');
  $('#inv').innerHTML=invited.map(p=>{let st=W.invites.get(String(p.id));return`<div class="playerRow ${p.system?'noPartnerRow':''}"><div><b>${esc(p.name)}</b><small>${p.system?'System position':esc(p.golfLink)}</small></div><div class="rowBtns traffic"><button class="dotBtn wait ${st==='awaiting'?'active':''}" title="Awaiting reply" data-wstatus="${p.id}|awaiting"></button><button class="dotBtn accept ${st==='accepted'?'active':''}" title="Accepted" data-wstatus="${p.id}|accepted"></button><button class="dotBtn decline ${st==='declined'?'active':''}" title="Declined" data-wstatus="${p.id}|declined"></button>${p.system?'':`<button class="info" data-wpinfo="${p.id}">i</button>`}</div></div>`}).join('')||'<p class="hint" style="padding:10px">No invitations yet.</p>';
  $('#conf').innerHTML=confirmed.map(p=>{
    const id=String(p.id),a=W.event.dayAvailability[id]||{1:true,2:true};
    return `<div class="playerRow confirmedAvailability ${p.system?'noPartnerRow':''}"><div><b>${esc(p.name)}</b><small>${p.system?'Missing player position':esc(p.golfLink)}</small></div>${W.event.days===2?`<div class="dayAvailability"><label><input type="checkbox" data-wday="${id}|1" ${a[1]!==false?'checked':''}> D1</label><label><input type="checkbox" data-wday="${id}|2" ${a[2]!==false?'checked':''}> D2</label></div>`:'<span>✓</span>'}</div>`
  }).join('')||'<p class="hint" style="padding:10px">Accepted players appear here.</p>';
  $$('[data-wday]').forEach(cb=>cb.onchange=()=>{let [id,day]=cb.dataset.wday.split('|');ensureAvailability(id);W.event.dayAvailability[id][+day]=cb.checked;draw()});
  restoreScroll();
 }
 draw()
}
document.addEventListener('click',e=>{let t=e.target;if(t.dataset.winvite){W.invites.set(String(t.dataset.winvite),'awaiting');renderStep2()}if(t.dataset.wstatus){let [id,s]=t.dataset.wstatus.split('|');W.invites.set(String(id),s);if(s==='accepted'){W.event.dayAvailability=W.event.dayAvailability||{};W.event.dayAvailability[String(id)]=W.event.dayAvailability[String(id)]||{1:true,2:true}}renderStep2()}if(t.dataset.wpinfo)playerInfo(t.dataset.wpinfo,W.invites.get(t.dataset.wpinfo)||'');if(t.dataset.wpinactive){let p=player(t.dataset.wpinactive);if(p&&confirm(`Make ${p.name} inactive?\n\nThe player remains in Away Golf history.`)){p.rosterActive=false;W.invites.delete(p.id);save();renderStep2()}}if(t.dataset.wpreactivate){let p=player(t.dataset.wpreactivate);if(p){p.rosterActive=true;save();renderStep2()}}});
function compDefinitions(){
 let d=W.event.days,c1=W.event.course1||'',c2=W.event.course2||'',n1=(course(c1)?.name||'').trim().toLowerCase(),n2=(course(c2)?.name||'').trim().toLowerCase(),same=d==2&&Boolean(c1)&&Boolean(c2)&&(String(c1)===String(c2)||(n1&&n1===n2)),defs=[{id:d==1?'single':'combined',name:'Single Stableford',desc:d==1?'Highest Stableford score over the round.':'Aggregate Stableford score over both days.',tag:d==1?'INDIVIDUAL':'2 DAYS'},{id:'fourball',name:'4BBB Stableford',desc:d==1?'Played by each 4BBB pair.':'Separate 4BBB Stableford on Day 1 and Day 2.',tag:'2-PLAYER PAIRS'},{id:'teamPutts',name:'Putting Competition',desc:'Choose a 4BBB pairs event or a four-player team event.',tag:'PAIRS OR TEAM'},{id:'best3of4',name:'Best 3 of 4 Stableford',desc:d==1?'Best three Stableford scores from the four-person team on every hole.':'Separate Best 3 of 4 event on each day.',tag:'4-PERSON TEAM'},{id:'par3',name:'Par 3 Competition',desc:d==1?'Aggregate Stableford score on the par 3s by each 4BBB pair.':'Choose one-day or two-day format.',tag:'PAR 3'},{id:'ntp',name:'Nearest the Pin',desc:d==1?'One NTP.':'One on Day 1 and one or two on Day 2.',tag:'NTP'},{id:'scratch',name:'Scratch',desc:'Optional event for low-handicap players and professionals.',tag:'OPTIONAL'}];
 if(d==2)defs.push({id:'eclectic',name:'Eclectic',desc:same?'Best Stableford score on each hole over the two rounds.':'Available only when the same course is played on both days.',tag:same?'AVAILABLE — SAME COURSE':'NOT AVAILABLE — DIFFERENT COURSES',unavailable:!same});
 return defs
}
function benefitSummary(id){
 let b=W.benefits[id]||{};
 if(id==='best3of4'){
   if(b.mode==='lottery'&&b.contribution)return `Currently Set at Lottery Pool — $${b.contribution} per team member`;
   if(b.mode==='prize'){
     let p=[];
     if(b.balls)p.push(`${b.balls} Ball${+b.balls===1?'':'s'}`);
     if(b.plus)p.push('+ Prize');
     if(b.extra)p.push(`(${b.extra})`);
     return p.length?`Currently Set at ${p.join(' ')}`:'Not Yet Set';
   }
   return 'Not Yet Set';
 }
 let p=[];
 if(b.balls)p.push(`${b.balls} Ball${+b.balls===1?'':'s'}`);
 if(b.plus)p.push('+ Prize');
 if(b.extra)p.push(`(${b.extra})`);
 return p.length?`Currently Set at ${p.join(' ')}`:'Not Yet Set';
}
function benefitHtml(id){
 let b=W.benefits[id]||{},open=W.benefitOpen.has(id);
 let body=id==='best3of4'
 ? `<div class="benefit ${open?'open':''}"><div class="benefitGrid"><label>Win Benefit<select data-bmode="${id}"><option value="" ${!b.mode?'selected':''}>Not Yet Set</option><option value="lottery" ${b.mode==='lottery'?'selected':''}>Lottery Pool</option><option value="prize" ${b.mode==='prize'?'selected':''}>Prize</option></select></label>${b.mode==='lottery'?`<label>Losing Team(s) Contribution<div class="benefitSuffix"><select data-bcontrib="${id}"><option value="">Not Yet Set</option>${[10,20,30,40,50].map(x=>`<option value="${x}" ${b.contribution==x?'selected':''}>$${x}</option>`).join('')}</select><span>per team member</span></div></label>`:''}${b.mode==='prize'?prizeFields(id,b):''}</div></div>`
 : `<div class="benefit ${open?'open':''}"><div class="benefitGrid">${prizeFields(id,b)}</div></div>`;
 return `<div class="benefitControlRow"><button class="soft benefitBtn" data-benefit="${id}">Set/Change Win Benefit</button><div class="benefitCurrent ${benefitSummary(id)==='Not Yet Set'?'notSet':''}">${benefitSummary(id)}</div></div>${body}`;
}
function prizeFields(id,b){return `<label>Balls per Winner<select data-bballs="${id}"><option value="">Not Yet Set</option>${[1,2,3,4,6,8,12].map(x=>`<option value="${x}" ${+b.balls===x?'selected':''}>${x} Ball${x===1?'':'s'}</option>`).join('')}</select></label><label>Additional reward<span style="display:block;margin-top:9px"><input style="width:auto" type="checkbox" data-bplus="${id}" ${b.plus?'checked':''}> + Prize</span></label><label class="prizeLabel"><span>Specify Prize</span><input data-bextra="${id}" value="${esc(b.extra||'')}" placeholder="Optional"></label>`}
function renderStep3(){
 let defs=compDefinitions(),ec=defs.find(x=>x.id==='eclectic');if(ec?.unavailable)W.competitions.delete('eclectic');
 let templateText=store.template?'Your previous event choices are loaded as the starting point. Change only what is different this time.':'Set up your first event. These choices will be retained as the starting point for your next event.';
 $('#wizardBody').innerHTML=`<h3>Competition Setup</h3><div class="templateNote">${templateText}</div>${defs.map(c=>{let on=W.competitions.has(c.id),disabled=c.unavailable;return`<div class="comp ${c.unavailable?'unavailable':''}"><div class="compTop"><input type="checkbox" data-comp="${c.id}" ${on?'checked':''} ${disabled?'disabled':''}><div><h4>${c.name}</h4><div class="hint">${c.desc}</div>${on&&!c.unavailable?benefitHtml(c.id):''}${c.id==='teamPutts'&&on?`<div class="ntpBox puttingFormatBox"><b>Putting Competition Format</b><label><input style="width:auto" type="radio" name="puttingFormat" value="pairs" ${W.event.puttingFormat==='pairs'?'checked':''}> 4BBB Pairs — the two partners' putts are added together</label><label><input style="width:auto" type="radio" name="puttingFormat" value="team" ${W.event.puttingFormat!=='pairs'?'checked':''}> Four-Player Team — all four group members' putts are added together</label></div>`:''}${c.id==='par3'&&on&&W.event.days==2?`<div class="ntpBox"><b>Competition Format</b><label><input style="width:auto" type="radio" name="p3" value="daily" ${(!W.event.par3Format||W.event.par3Format==='daily')?'checked':''}> One Par 3 event each day</label><label><input style="width:auto" type="radio" name="p3" value="aggregate" ${W.event.par3Format==='aggregate'?'checked':''}> Aggregate Par 3 event over 2 days — partner is Day 2 4BBB partner</label></div>`:''}${c.id==='ntp'&&on&&W.event.days==2?`<div class="ntpBox"><b>Day 2 NTPs</b><label><input style="width:auto" type="radio" name="n2" value="1" ${W.event.ntpDay2Count==1?'checked':''}> One</label><label><input style="width:auto" type="radio" name="n2" value="2" ${W.event.ntpDay2Count!=1?'checked':''}> Two</label></div>`:''}</div><span class="tag">${c.tag}</span></div></div>`}).join('')}`;
 $$('[data-comp]').forEach(x=>x.onchange=()=>{x.checked?W.competitions.add(x.dataset.comp):W.competitions.delete(x.dataset.comp);renderStep3()});$$('[data-benefit]').forEach(x=>x.onclick=()=>{W.benefitOpen.has(x.dataset.benefit)?W.benefitOpen.delete(x.dataset.benefit):W.benefitOpen.add(x.dataset.benefit);renderStep3()});
 $('#wizardBody').onchange=e=>{let t=e.target,id=t.dataset.bmode||t.dataset.bballs||t.dataset.bcontrib||t.dataset.bplus||t.dataset.bextra;if(t.name==='puttingFormat')W.event.puttingFormat=t.value;if(t.name==='p3')W.event.par3Format=t.value;if(t.name==='n2')W.event.ntpDay2Count=+t.value;if(id){W.benefits[id]=W.benefits[id]||{};if(t.dataset.bmode)W.benefits[id].mode=t.value;if(t.dataset.bballs)W.benefits[id].balls=+t.value||'';if(t.dataset.bcontrib)W.benefits[id].contribution=+t.value||'';if(t.dataset.bplus)W.benefits[id].plus=t.checked;if(t.dataset.bextra)W.benefits[id].extra=t.value;W.benefitOpen.add(id);renderStep3()}}
}
function renderStep4(){
 const pref=Boolean(W.event.preferredLies),putting=W.competitions.has('teamPutts'),oneDay=W.event.days==1,puttingUnit=W.event.puttingFormat==='pairs'?'pair':'team';
 const defaultRules=oneDay?`Winning ${puttingUnit}
The lowest total number of putts by a ${puttingUnit} over the round wins.

On-course play
1. The ball must be on the green to count as a putt.
2. All balls must be putted into the hole — NO GIMMIES.
3. Players who have no shots left before they reach the green will place the ball on the green at the point furthest from the hole and take the first putt from that point.

Count-back if tied
1. The ${puttingUnit} with the lowest number of putts on the back 9.
2. The ${puttingUnit} with the lowest number of putts on the last 6 holes.
3. The ${puttingUnit} with the lowest number of putts on the last 3 holes.`:`Winning ${puttingUnit}
The lowest total number of putts by a ${puttingUnit} over the round wins.

On-course play
1. The ball must be on the green to count as a putt.
2. All balls must be putted into the hole — NO GIMMIES.
3. Players who have no shots left before they reach the green will place the ball on the green at the point furthest from the hole and take the first putt from that point.

Count-back if tied
1. The ${puttingUnit} with the lowest number of putts on the last day.
2. The ${puttingUnit} with the lowest number of putts on the back 9 on the last day.
3. The ${puttingUnit} with the lowest number of putts on the last 6 holes.
4. The ${puttingUnit} with the lowest number of putts on the last 3 holes.`;
 const txt=W.event.puttingRulesCustom||defaultRules,editing=Boolean(W.editPuttingRules);
 $('#wizardBody').innerHTML=`<div class="rulesHead"><div><h3>Rules</h3><p class="hint">Set any conditions that differ from normal play.</p></div><span class="rulesBadge">EVENT RULES</span></div>
 <div class="ruleCard preferredCard"><h4>Preferred Lies</h4><div class="preferredLine"><div class="preferredStatus ${pref?'yes':''}">${pref?'Yes':'No'}</div><div class="preferredDefault">${pref?'Preferred lies are in use for this event.':'Default for every new event is play the ball as it lies.'}</div><button type="button" class="soft" id="changePreferred">Change</button></div>${pref?`<div class="prefArea"><label>Preferred Lies Apply<select id="prefArea"><option value="general" ${W.event.preferredLiesArea==='general'?'selected':''}>In the General Area</option><option value="fairway" ${W.event.preferredLiesArea==='fairway'?'selected':''}>On the closely mown part of the course</option></select></label></div>`:''}</div>
 ${putting?`<div class="ruleCard puttingRules"><div class="autoRuleHead"><div><h4>Putting Competition Rules</h4><p class="hint">Included automatically because Putting Competition is selected.</p></div><div class="ruleHeadBtns"><span class="autoTag">AUTOMATIC</span><button type="button" class="soft miniRuleBtn" id="editPutting">${editing?'Done':'Edit'}</button></div></div>${editing?`<textarea id="puttingRulesEdit" rows="13">${esc(txt)}</textarea>`:`<div class="puttingRuleText">${esc(txt)}</div>`}</div>`:''}
 <div class="ruleCard"><div class="ruleSectionHead"><div><h4>Special Rules</h4><p class="hint">Add only extra instructions that players need for this event.</p></div><button type="button" class="soft miniRuleBtn" id="clearSpecial">Clear</button></div><textarea id="specialRules" rows="6" placeholder="e.g. Local event rule, special competition instruction, course condition...">${esc(W.event.specialRules||'')}</textarea></div>
 <div class="rulesPreview ${W.rulesPreviewAck?'acknowledged':''}"><div><b>Player acknowledgement</b><span>${W.rulesPreviewAck?'Acknowledgement recorded for this preview.':'Players see the event rules before scoring begins.'}</span></div><button type="button" class="gotItPreview" id="gotItPreview">${W.rulesPreviewAck?'✓ Got It':'Got It'}</button></div>`;
 $('#changePreferred').onclick=()=>{W.event.preferredLies=!W.event.preferredLies;if(!W.event.preferredLies)W.event.preferredLiesArea='general';renderStep4()};
 if($('#prefArea'))$('#prefArea').onchange=e=>W.event.preferredLiesArea=e.target.value;
 if($('#editPutting'))$('#editPutting').onclick=()=>{W.editPuttingRules=!W.editPuttingRules;renderStep4()};
 if($('#puttingRulesEdit'))$('#puttingRulesEdit').oninput=e=>W.event.puttingRulesCustom=e.target.value;
 $('#specialRules').oninput=e=>W.event.specialRules=e.target.value;
 $('#clearSpecial').onclick=()=>{W.event.specialRules='';renderStep4()};
 $('#gotItPreview').onclick=()=>{W.rulesPreviewAck=!W.rulesPreviewAck;renderStep4()};
}
function renderStep5(){
 const ntpOn=W.competitions.has('ntp');
 if(!ntpOn){$('#wizardBody').innerHTML=`<div class="ntpHead"><div><h3>Nearest the Pin</h3><p class="hint">NTP hole selection</p></div><span class="rulesBadge">NTP</span></div><div class="ruleCard"><h4>Nearest the Pin is not included in this event.</h4><p class="hint">There is nothing to set up on this page.</p></div>`;return}
 W.event.ntpSelections=W.event.ntpSelections||{};
 const par3s=id=>{let v=version(course(id))||{},r=[];for(let i=0;i<18;i++)if(+v.par?.[i]===3)r.push({hole:i+1,index:String(v.index?.[i]??''),metres:v.metres?.[i]??''});let rank=x=>{let n=parseInt(x.index.split('/')[0],10);return Number.isFinite(n)?n:-1};return r.sort((x,y)=>rank(y)-rank(x)||x.hole-y.hole)};
 const ensure=(key,id,count)=>{let ch=par3s(id),v=Array.isArray(W.event.ntpSelections[key])?W.event.ntpSelections[key].map(Number):[];v=v.filter((h,i)=>ch.some(x=>x.hole===h)&&v.indexOf(h)===i).slice(0,count);for(let x of ch){if(v.length>=count)break;if(!v.includes(x.hole))v.push(x.hole)}W.event.ntpSelections[key]=v;return ch};
 const d1=ensure('day1',W.event.course1,1),n2=W.event.days==2?(+W.event.ntpDay2Count||2):0,d2=W.event.days==2?ensure('day2',W.event.course2,n2):[];
 const startLabel=day=>{const method=startMethodFor(W.event,day),holes=startHolesFor(W.event,day);if(method==='shotgun')return 'Today is a Shotgun start';if(method==='two')return `Starting tees today are Holes ${holes[0]} and ${holes[1]}`;return `Starting tee today is Hole ${holes[0]}`};
 const row=(day,key,slot,ch,cid)=>{let sel=W.event.ntpSelections[key][slot],open=W.ntpChange===`${key}:${slot}`,used=W.event.ntpSelections[key].filter((_,i)=>i!==slot),x=ch.find(q=>q.hole===sel);return`<div class="ntpSelectCard"><div class="ntpDay"><b>${day}${W.event.ntpSelections[key].length>1?` — NTP ${slot+1}`:''}</b><span>${esc(course(cid)?.name||'Course')}</span></div><div class="ntpSelected"><div><small>SELECTED</small><strong>Hole ${sel||'—'}</strong><span>${x?`Par 3${x.metres?` · ${x.metres} m`:''}${x.index?` · Index ${esc(x.index)}`:''}`:''}</span></div><button type="button" class="soft" data-ntpchange="${key}:${slot}">${open?'Close':'Change'}</button></div>${open?`<div class="ntpChoices"><b>Choose another Par 3</b>${ch.map(q=>`<button type="button" class="ntpChoice ${q.hole===sel?'selected':''} ${used.includes(q.hole)?'used':''}" ${used.includes(q.hole)?'disabled':''} data-ntppick="${key}:${slot}:${q.hole}"><span>Hole ${q.hole}</span><small>${q.metres?q.metres+' m · ':''}${q.index?'Index '+esc(q.index):''}${q.hole===sel?' · Selected':''}</small></button>`).join('')}</div>`:''}</div>`};
 const dayHead=(day,key)=>`<div class="ntpDayHeading"><h4>Day ${day}</h4><strong>${esc(startLabel(day))}</strong>${W.event.ntpSelections[key].length===2?`<button type="button" class="soft" data-ntpswap="${key}">⇄ Swap NTP Order</button>`:''}</div>`;
 $('#wizardBody').innerHTML=`<div class="ntpHead"><div><h3>Nearest the Pin</h3><p class="hint">The easiest-rated Par 3 holes have been selected automatically. Use Change only if you want a different hole.</p></div><span class="rulesBadge">NTP</span></div><div class="ntpDayGroup">${dayHead(1,'day1')}${row('Day 1','day1',0,d1,W.event.course1)}</div>${W.event.days==2?`<div class="ntpDayGroup">${dayHead(2,'day2')}${Array.from({length:n2},(_,i)=>row('Day 2','day2',i,d2,W.event.course2)).join('')}</div>`:''}<div class="ntpInfo"><b>During play</b><span>On each NTP hole, players can confirm that they put their name on the NTP sheet. The latest confirmed entry on each hole becomes the current NTP holder.</span></div>`;
 $$('[data-ntpchange]').forEach(b=>b.onclick=()=>{W.ntpChange=W.ntpChange===b.dataset.ntpchange?'':b.dataset.ntpchange;renderStep5()});
 $$('[data-ntppick]').forEach(b=>b.onclick=()=>{let [k,s,h]=b.dataset.ntppick.split(':');W.event.ntpSelections[k][+s]=+h;W.ntpChange='';renderStep5()})
 $$('[data-ntpswap]').forEach(b=>b.onclick=()=>{const k=b.dataset.ntpswap,v=W.event.ntpSelections[k];if(v?.length===2){[v[0],v[1]]=[v[1],v[0]];W.ntpChange='';renderStep5()}})
}function renderStep6(){
 const displayDate=(iso)=>{
   if(!iso)return 'No date';
   const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
   return m?`${m[3]}/${m[2]}/${m[1]}`:iso;
 };
 const joinHoles=(arr)=>{
   const holes=(arr||[]).map(h=>'Hole '+h);
   if(holes.length<=1)return holes[0]||'Not selected';
   if(holes.length===2)return holes[0]+' and '+holes[1];
   return holes.slice(0,-1).join(', ')+ ' and ' + holes[holes.length-1];
 };
 const confirmed=[...W.invites.entries()].filter(([id,s])=>s==='accepted').map(([id])=>player(id)).filter(Boolean);const day1Ids=wizardDayPlayers(1),day2Ids=W.event.days===2?wizardDayPlayers(2):[];
 const selectedDefs=compDefinitions().filter(c=>W.competitions.has(c.id)&&!c.unavailable);
 const c1=course(W.event.course1),c2=W.event.days==2?course(W.event.course2):null;
 const rules=[];
 rules.push(`Preferred Lies: ${W.event.preferredLies?(W.event.preferredLiesArea==='fairway'?'Yes — closely mown part of the course':'Yes — General Area'):'No — play the ball as it lies'}`);
 if(W.competitions.has('teamPutts'))rules.push('Putting Competition Rules included');
 if((W.event.specialRules||'').trim())rules.push('Special Rules entered');

 const ntpText=()=>{
   if(!W.competitions.has('ntp'))return 'Not included';
   let d1=joinHoles(W.event.ntpSelections?.day1);
   if(W.event.days==1)return `Day 1 — ${d1}`;
   let d2=joinHoles(W.event.ntpSelections?.day2);
   return `Day 1 — ${d1}<br>Day 2 — ${d2}`;
 };

 const checks=[
   {ok:Boolean((W.event.name||'').trim()),label:'Event name'},
   {ok:Boolean(W.event.date),label:'Start date'},
   {ok:Boolean(W.event.course1),label:'Day 1 course'},
   {ok:W.event.days==1||Boolean(W.event.course2),label:'Day 2 course'},
   {ok:confirmed.length>0,label:'Confirmed players'},
   {ok:day1Ids.length>=(+W.event.fieldSize||0)&&(W.event.days===1||day2Ids.length>=(+W.event.fieldSize||0)),label:'Daily field selected'},
   {ok:selectedDefs.length>0,label:'Competitions selected'},
   {ok:!W.competitions.has('ntp')||Boolean(W.event.ntpSelections?.day1?.length),label:'NTP holes selected'}
 ];
 const allReady=checks.every(x=>x.ok);

 const dayStartDesc=(day)=>{
   const m=startMethodFor(W.event,day),h=startHolesFor(W.event,day);
   if(m==='shotgun')return 'Shotgun';
   if(m==='two')return `Two Tees — Holes ${h[0]} and ${h[1]}`;
   return `Single Tee — Hole ${h[0]}`;
 };
 const startDesc=W.event.days===2?`Day 1: ${dayStartDesc(1)} · Day 2: ${dayStartDesc(2)}`:dayStartDesc(1);

 $('#wizardBody').innerHTML=`<div class="startHead"><div><h3>Event Plan Ready</h3><p class="hint">Review the plan before proceeding to scoring setup. The plan remains editable until you Lock Event.</p></div><span class="startBadge ${allReady?'ready':'check'}">${allReady?'READY':'CHECK'}</span></div>

 <div class="startSummaryGrid">
   <div class="startCard">
     <h4>Event</h4>
     <p><b>${esc(W.event.name||'Unnamed event')}</b></p>
     <p>${esc(displayDate(W.event.date))} · ${W.event.days==2?'2 days':'1 day'} · ${esc(startDesc)}</p>
     <p>Field size: ${W.event.fieldSize}</p>
   </div>

   <div class="startCard">
     <h4>Courses</h4>
     <p><b>Day 1:</b> ${esc(c1?.name||'Not selected')}</p>
     ${W.event.days==2?`<p><b>Day 2:</b> ${esc(c2?.name||'Not selected')}</p>`:''}
   </div>

   <div class="startCard">
     <h4>Players</h4>
     <p><b>${confirmed.length}</b> event players confirmed</p><p><b>Day 1:</b> ${day1Ids.length} positions${W.event.days===2?` · <b>Day 2:</b> ${day2Ids.length} positions`:''}</p><p>${confirmed.slice(0,9).map(p=>esc(p.name)).join(', ')}${confirmed.length>9?'…':''}</p>
   </div>

   <div class="startCard">
     <h4>Competitions</h4>
     <p>${selectedDefs.length?selectedDefs.map(c=>esc(c.name)).join(' · '):'None selected'}</p>
   </div>

   <div class="startCard">
     <h4>Rules</h4>
     <p>${rules.map(esc).join('<br>')}</p>
   </div>

   <div class="startCard">
     <h4>Nearest the Pin</h4>
     <p>${ntpText()}</p>
   </div>
 </div>

 <div class="finalCheck">
   <h4>Final Check</h4>
   <div class="checkList">${checks.map(x=>`<div class="${x.ok?'ok':'warn'}"><span>${x.ok?'✓':'!'}</span>${x.label}</div>`).join('')}</div>
 </div>

 <div class="startNotice ${allReady?'oneLine':''}">
   ${allReady?'<b>Everything required for setup is complete but you can make changes to any element until Lock Event is used.</b>':'<b>A setup item still needs attention.</b><span>Use Back to correct anything marked with ! before proceeding.</span>'}
 </div>

 <div class="startConfirmRow"><div><b>Starting Tee Check</b><span>${esc(startDesc)}</span></div><button type="button" class="soft" id="changeStartingTee">Change Starting Tee</button></div>
 <button type="button" class="startEventBig" id="startEventBig" ${allReady?'':'disabled'}>SAVE EVENT PLAN – PROCEED TO SET UP SCORING</button>`;

 $('#changeStartingTee').onclick=()=>{W.step=1;renderWizard()};
 $('#startEventBig').onclick=()=>{
   if(!allReady)return;
   finishEvent();
 };
}
function finishEvent(){
 let confirmed=[...W.invites].filter(x=>x[1]==='accepted').map(x=>String(x[0]));
 let dayAvailability=JSON.parse(JSON.stringify(W.event.dayAvailability||{}));
 const dayFields={};
 dayFields.day1=confirmed.filter(id=>W.event.days===1||dayAvailability[id]?.[1]!==false);
 if(W.event.days===2)dayFields.day2=confirmed.filter(id=>dayAvailability[id]?.[2]!==false);
 const oldGroups=store.event?.groupSetup;
 store.event={...W.event,confirmed,dayAvailability,dayFields,competitions:[...W.competitions],benefits:W.benefits,status:'planned',locked:false,groupSetup:oldGroups};
 store.template={competitions:[...W.competitions].filter(x=>x!=='eclectic'),benefits:W.benefits,puttingFormat:W.event.puttingFormat||'team',par3Format:W.event.par3Format||'daily',ntpDay2Count:W.event.ntpDay2Count||2};
 localStorage.setItem('awayGolfOrganiserTemplateV1',JSON.stringify(store.template));
 // Rebuild groups if the daily fields have changed.
 store.event.groupSetup={};
 initialiseGroups();
 save();
 $('#wizardShade').classList.remove('open');
 nav('teamsPage');
}


function pairKey(a,b){return [String(a),String(b)].sort().join('|')}
function playedTogetherCount(a,b){if(String(a)===NO_PARTNER_ID||String(b)===NO_PARTNER_ID)return 0;return +(store.pairHistory?.[pairKey(a,b)]||0)}
function partneredCount(a,b){if(String(a)===NO_PARTNER_ID||String(b)===NO_PARTNER_ID)return 0;return +(store.partnerHistory?.[pairKey(a,b)]||0)}
function groupRepeatScore(g,day){
 let score=0;
 for(let i=0;i<g.length;i++)for(let j=i+1;j<g.length;j++){
   score+=playedTogetherCount(g[i],g[j]);
   // Strongly discourage repeating Day 1 group-mates on Day 2.
   if(day===2){
     const d1=store.event?.groupSetup?.day1?.groups||[];
     if(d1.some(old=>old.some(x=>String(x)===String(g[i]))&&old.some(x=>String(x)===String(g[j]))))score+=12;
   }
 }
 // Repeated 4BBB partnerships are more important than simply sharing the four.
 if(g.length>=2){
   score+=2*partneredCount(g[0],g[1]);
   if(day===2){
     const d1=store.event?.groupSetup?.day1?.groups||[];
     if(d1.some(old=>old.length>=2&&pairKey(old[0],old[1])===pairKey(g[0],g[1])))score+=25;
     if(d1.some(old=>old.length>=4&&pairKey(old[2],old[3])===pairKey(g[0],g[1])))score+=25;
   }
 }
 if(g.length>=4){
   score+=2*partneredCount(g[2],g[3]);
   if(day===2){
     const d1=store.event?.groupSetup?.day1?.groups||[];
     if(d1.some(old=>old.length>=2&&pairKey(old[0],old[1])===pairKey(g[2],g[3])))score+=25;
     if(d1.some(old=>old.length>=4&&pairKey(old[2],old[3])===pairKey(g[2],g[3])))score+=25;
   }
 }
 return score;
}
function drawRepeatScore(groups,day){return groups.reduce((n,g)=>n+groupRepeatScore(g,day),0)}
function fourballDrawSignature(groups){
 return groups.map(g=>{
   const pairs=[];for(let i=0;i<g.length;i+=2)pairs.push(g.slice(i,i+2).map(String).sort().join(','));
   return pairs.sort().join('/');
 }).sort().join('|');
}
function repeatsDay1Fourball(groups){
 const oldPairs=new Set((store.event?.groupSetup?.day1?.groups||[]).flatMap(g=>[g.slice(0,2),g.slice(2,4)]).filter(p=>p.length===2&&!p.some(x=>String(x)===NO_PARTNER_ID)).map(p=>pairKey(p[0],p[1])));
 return groups.some(g=>[g.slice(0,2),g.slice(2,4)].some(p=>p.length===2&&!p.some(x=>String(x)===NO_PARTNER_ID)&&oldPairs.has(pairKey(p[0],p[1]))));
}
function historyBalancedGroups(ids,day){
 const seen=new Set(),candidates=[];
 for(let n=0;n<1800;n++){
   const cand=makeGroups(shuffleCopy(ids));
   const signature=fourballDrawSignature(cand);
   if(seen.has(signature))continue;
   seen.add(signature);
   candidates.push({groups:cand,score:drawRepeatScore(cand,day),repeatsPartner:day===2&&repeatsDay1Fourball(cand)});
 }
 if(!candidates.length)return makeGroups(ids);
 const eligible=day===2&&candidates.some(x=>!x.repeatsPartner)?candidates.filter(x=>!x.repeatsPartner):candidates;
 eligible.sort((a,b)=>a.score-b.score);
 const best=eligible[0].score;
 // Allow a few near-equal good solutions so repeated clicks can show another sensible draw.
 const shortlist=eligible.filter(x=>x.score<=best+2).slice(0,12);
 return shortlist[Math.floor(Math.random()*shortlist.length)].groups;
}
function playerHistoryAgainstGroup(pid,g){
 return g.filter(x=>String(x)!==String(pid)).map(id=>({
   id,name:player(id)?.name||'Unknown',
   played:playedTogetherCount(pid,id),
   partners:partneredCount(pid,id)
 })).sort((a,b)=>(b.partners-a.partners)||(b.played-a.played));
}
function recordCompletedEventHistory(){
 if(!store.event?.groupSetup)return;
 for(let day=1;day<=store.event.days;day++){
   const gs=store.event.groupSetup['day'+day]?.groups||[];
   for(const g of gs){
     for(let i=0;i<g.length;i++)for(let j=i+1;j<g.length;j++){
       let k=pairKey(g[i],g[j]);store.pairHistory[k]=(store.pairHistory[k]||0)+1;
     }
     if(g.length>=2){let k=pairKey(g[0],g[1]);store.partnerHistory[k]=(store.partnerHistory[k]||0)+1}
     if(g.length>=4){let k=pairKey(g[2],g[3]);store.partnerHistory[k]=(store.partnerHistory[k]||0)+1}
   }
 }
 save();
}
function shuffleCopy(arr){
 let a=[...arr];
 for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
 return a;
}
function makeGroups(ids){
 let out=[];
 for(let i=0;i<ids.length;i+=4)out.push(ids.slice(i,i+4));
 return out;
}
function defaultStarts(groups,method,day=1){
 method=method||startMethodFor(store.event,day);
 if(method==='shotgun'){
   const common=[1,3,5,7,9,10,12,14,16,18];
   return groups.map((_,i)=>common[i]||((i*2)%18)+1);
 }
 const holes=startHolesFor(store.event,day);
 if(method==='two')return groups.map((_,i)=>+(holes[i%2]||1));
 if(method==='single')return groups.map(()=>+(holes[0]||1));
 return groups.map((_,i)=>i+1);
}
function dayFieldIds(day){
 if(!store.event)return[];
 const key='day'+day;
 if(store.event.dayFields?.[key])return store.event.dayFields[key].map(String);
 const ids=(store.event.confirmed||[]).map(String);
 if(store.event.days===1)return ids;
 return ids.filter(id=>store.event.dayAvailability?.[id]?.[day]!==false);
}
function noPartnerContext(groups,day){
 const all=dayFieldIds(day),shortIndex=groups.findIndex(g=>g.some(id=>String(id)===NO_PARTNER_ID));
 if(shortIndex<0)return null;
 const g=groups[shortIndex],npIndex=g.findIndex(id=>String(id)===NO_PARTNER_ID);
 const pairStart=npIndex<2?0:2;
 const affected=g.slice(pairStart,pairStart+2).find(id=>String(id)!==NO_PARTNER_ID);
 const realInGroup=g.filter(id=>String(id)!==NO_PARTNER_ID);
 const candidates=all.filter(id=>String(id)!==NO_PARTNER_ID&&String(id)!==String(affected));
 return {groupIndex:shortIndex,noPartnerIndex:npIndex,affected:String(affected||''),realInGroup,candidates};
}
function chooseRandom(arr,exclude=[]){
 const ex=new Set(exclude.map(String)),a=arr.filter(x=>!ex.has(String(x)));
 return a.length?a[Math.floor(Math.random()*a.length)]:null;
}
function ensureShortTeamSelections(setup,day){
 const ctx=noPartnerContext(setup.groups,day);
 if(!ctx){setup.virtualPlayer=null;setup.ntpExtraPlayer=null;return}
 if(!setup.virtualPlayer||!ctx.candidates.map(String).includes(String(setup.virtualPlayer)))setup.virtualPlayer=chooseRandom(ctx.candidates);
 if((store.event.competitions||[]).includes('ntp')){
   const eligible=ctx.realInGroup.map(String);
   if(!setup.ntpExtraPlayer||!eligible.includes(String(setup.ntpExtraPlayer)))setup.ntpExtraPlayer=chooseRandom(eligible);
 }else setup.ntpExtraPlayer=null;
}
function initialiseGroups(){
 if(!store.event)return;
 store.event.groupSetup=store.event.groupSetup||{};
 for(let day=1;day<=store.event.days;day++){
   const key='day'+day,ids=dayFieldIds(day);
   const current=store.event.groupSetup[key];
   const same=current&&current.groups&&current.groups.flat().map(String).sort().join('|')===ids.map(String).sort().join('|');
   if(!same){
     // Build the first view with the same History Balanced logic the organiser gets by pressing the button.
     // Day 2 therefore sees the newly-created Day 1 and avoids unnecessary repeats immediately.
     let groups=historyBalancedGroups(ids,day);
     // Extra safeguard: if No Partner exists on both days, avoid allocating it to the same golfer where alternatives exist.
     if(day===2&&groups.some(g=>g.some(x=>String(x)===NO_PARTNER_ID))){
       const d1=store.event.groupSetup.day1,ctx1=d1?noPartnerContext(d1.groups,1):null;
       let ctx2=noPartnerContext(groups,2);
       if(ctx1&&ctx2&&String(ctx1.affected)===String(ctx2.affected)){
         const npG=ctx2.groupIndex,npI=ctx2.noPartnerIndex;
         let swapped=false;
         for(let gi=0;gi<groups.length&&!swapped;gi++)for(let pi=0;pi<groups[gi].length&&!swapped;pi++){
           const candidate=String(groups[gi][pi]);
           if(candidate!==NO_PARTNER_ID&&candidate!==String(ctx1.affected)){
             const temp=groups[npG][npI===0?1:npI===2?3:npI-1];
             const partnerIndex=npI===0?1:npI===2?3:npI-1;
             groups[npG][partnerIndex]=groups[gi][pi];
             groups[gi][pi]=temp;
             swapped=true;
           }
         }
       }
     }
     store.event.groupSetup[key]={groups,starts:defaultStarts(groups,startMethodFor(store.event,day),day),saved:false,virtualPlayer:null,ntpExtraPlayer:null};
   }
   ensureShortTeamSelections(store.event.groupSetup[key],day);
 }
 store.event.activeGroupDay=store.event.activeGroupDay||1;
 store.event.drawMode=store.event.drawMode||'history';
 store.event.manualMode=store.event.drawMode==='manual';
 if(store.event.swapPlayer===undefined)store.event.swapPlayer=null;
}
function groupCompetitionText(){
 if(!store.event)return '';
 let c=new Set(store.event.competitions||[]),parts=[];
 if(c.has('fourball'))parts.push('4BBB partners are the two pairs shown in each group');
 if(c.has('teamPutts'))parts.push(store.event.puttingFormat==='pairs'?'the two 4BBB partnerships are the Putting pairs':'the full four-person group is the Putting team');
 if(c.has('best3of4'))parts.push('the full four-person group is the Best 3 of 4 team');
 return parts.join(' · ');
}
function eventDayHandicaps(day){
 store.event.dailyHandicaps=store.event.dailyHandicaps||{day1:{},day2:{}};
 store.event.dailyHandicaps['day'+day]=store.event.dailyHandicaps['day'+day]||{};
 return store.event.dailyHandicaps['day'+day];
}
function playerDailyHandicap(id,day){
 const v=eventDayHandicaps(day)[String(id)];
 return v===''||v==null?null:+v;
}
function stablefordStrokeCount(indexValue,handicap){
 handicap=+handicap||0;if(handicap<=0)return 0;
 const txt=String(indexValue??'').trim();
 if(txt.includes('/'))return txt.split('/').map(x=>+String(x).trim()).filter(Number.isFinite).filter(x=>x<=handicap).length;
 const idx=+txt;if(!idx)return 0;
 const base=Math.floor(handicap/18),rem=handicap%18;
 return base+(rem&&idx<=rem?1:0);
}
function stablefordPoints(gross,par,indexValue,handicap){
 if(String(gross).toUpperCase()==='P')return 0;
 gross=+gross;par=+par;if(!gross||!par||handicap==null)return null;
 return Math.max(0,2+par+stablefordStrokeCount(indexValue,handicap)-gross);
}
function scoreSequence(start){start=+start||1;return Array.from({length:18},(_,i)=>((start-1+i)%18)+1)}
function scoringDayStore(day){
 store.event.scoring=store.event.scoring||{day1:{},day2:{}};
 store.event.scoring['day'+day]=store.event.scoring['day'+day]||{};
 return store.event.scoring['day'+day];
}
function scorerStore(day,scorerId){
 const d=scoringDayStore(day),id=String(scorerId);d[id]=d[id]||{};return d[id];
}
function scoreRecord(day,scorerId,hole){
 const s=scorerStore(day,scorerId),k=String(hole);s[k]=s[k]||{official:{},self:{},ntp:{}};return s[k];
}
const scoreEntered=value=>value!==''&&value!=null;
function roundFinalisedFor(day,playerId){
 return Boolean(store.event?.roundFinalised?.['day'+day]?.[String(playerId)]||scoringDayStore(day)?.[String(playerId)]?._meta?.finalisedAt);
}
function verificationIssueCount(day,playerId){
 const c=course(day===1?store.event.course1:store.event.course2),v=version(c)||{},mine=scoringDayStore(day)?.[String(playerId)]||{};
 return Array.from({length:18},(_,i)=>i+1).filter(h=>{const self=mine[String(h)]?.self||{},off=findOfficialForPlayer(day,playerId,h),selfGross=self.gross??'',offGross=off?.gross??'';if(!off||!scoreEntered(selfGross)||!scoreEntered(offGross))return true;const grossMatch=String(offGross).toUpperCase()===String(selfGross).toUpperCase(),hcp=playerDailyHandicap(playerId,day),offPts=stablefordPoints(offGross,+(v.par?.[h-1]||0),v.index?.[h-1]??'',hcp),selfPts=stablefordPoints(selfGross,+(v.par?.[h-1]||0),v.index?.[h-1]??'',hcp);return!(grossMatch||(offPts!=null&&selfPts!=null&&offPts===selfPts))}).length;
}
function livePlayerStatus(day,playerId){
 const setup=store.event.groupSetup?.['day'+day],ctx=playerGroupContext(playerId,day),start=setup?.starts?.[ctx?.groupIndex]||1,seq=scoreSequence(start),mine=scoringDayStore(day)?.[String(playerId)]||{},entered=seq.filter(h=>scoreEntered(mine[String(h)]?.self?.gross)).length,finalised=roundFinalisedFor(day,playerId),issues=entered===18?verificationIssueCount(day,playerId):0,next=seq[Math.min(entered,17)],joined=Boolean((store.cloudPlayers||[]).find(x=>String(x.playerId)===String(playerId))?.joined);
 let state='notStarted',label='Not started',detail=joined?'Connected · ready to start':'Phone not joined';
 if(entered>0&&entered<18){state='playing';label='Playing';detail=`Hole ${next} next · ${entered} of 18 entered`}
 if(entered===18&&issues){state='attention';label='Attention';detail=`${issues} score${issues===1?'':'s'} need checking`}
 if(entered===18&&!issues){state='ready';label='Ready to finalise';detail='All 18 player and marker scores agree'}
 if(finalised){state='finalised';label='Finalised';detail='Round checked and complete'}
 return{playerId:String(playerId),joined,entered,finalised,issues,state,label,detail,group:(ctx?.groupIndex??0)+1};
}
function renderLiveEventControl(){
 const host=$('#liveEventControl'),basic=$('#basicEventProgress');if(!host||!basic)return;
 if(!store.event?.locked||isPlayerDevice()){host.innerHTML='';basic.style.display='';return}
 basic.style.display='none';const days=store.event.days||1,day=Math.min(days,+(store.event.liveControlDay||store.event.activeGroupDay||1)),ids=dayFieldIds(day).filter(id=>String(id)!==NO_PARTNER_ID).map(String),rows=ids.map(id=>livePlayerStatus(day,id)).sort((a,b)=>a.group-b.group||(player(a.playerId)?.name||'').localeCompare(player(b.playerId)?.name||'')),joined=rows.filter(x=>x.joined).length,playing=rows.filter(x=>x.state==='playing'||x.state==='ready').length,attention=rows.filter(x=>x.state==='attention').length,finalised=rows.filter(x=>x.finalised).length,allFinal=Boolean(rows.length&&finalised===rows.length);
 host.innerHTML=`<section class="liveControlCard"><div class="liveControlHead"><div><small>ORGANISER'S LIVE EVENT CONTROL</small><h2>Day ${day} Round Progress</h2><p>See who is connected, playing, waiting for a score check or finished.</p></div><button class="soft" id="refreshLiveControl">Refresh</button></div>${days===2?`<div class="liveDayTabs"><button data-liveday="1" class="${day===1?'active':''}">Day 1</button><button data-liveday="2" class="${day===2?'active':''}">Day 2</button></div>`:''}<div class="liveCounters"><div><small>JOINED</small><b>${joined}<em>/${rows.length}</em></b></div><div><small>PLAYING</small><b>${playing}</b></div><div class="${attention?'warn':''}"><small>ATTENTION</small><b>${attention}</b></div><div class="${allFinal?'done':''}"><small>FINALISED</small><b>${finalised}<em>/${rows.length}</em></b></div></div>${allFinal?`<div class="prizeReady"><div><b>✓ Prize Giving Ready</b><span>Every Day ${day} scorecard has been checked and finalised.</span></div><button class="primary" id="openPrizeSummary">Open Results Summary</button></div>`:`<div class="resultsWaiting"><b>Results remain In Progress</b><span>${rows.length-finalised} player${rows.length-finalised===1?'':'s'} still to finalise Day ${day}.</span></div>`}<div class="livePlayerList">${rows.map(r=>`<div class="livePlayerRow ${r.state}"><div class="livePlayerName"><i class="${r.joined?'connected':''}"></i><span><b>${esc(player(r.playerId)?.name||'Player')}</b><small>Group ${r.group} · ${r.joined?'Phone joined':'Not joined'}</small></span></div><div class="liveProgress"><span><i style="width:${Math.round(r.entered/18*100)}%"></i></span><small>${r.entered}/18</small></div><div class="livePlayerState"><b>${esc(r.label)}</b><small>${esc(r.detail)}</small></div></div>`).join('')||'<p class="leaderEmpty">No players are assigned for this day.</p>'}</div><p class="liveControlNote">Attention means a player has entered all 18 holes but one or more player/marker scores are missing or do not agree.</p></section>`;
 $$('[data-liveday]').forEach(b=>b.onclick=()=>{store.event.liveControlDay=+b.dataset.liveday;localStorage.setItem('awayGolf13',JSON.stringify(store));renderLiveEventControl()});$('#refreshLiveControl').onclick=async()=>{await syncCloudNow();renderLiveEventControl()};if($('#openPrizeSummary'))$('#openPrizeSummary').onclick=()=>{store.event.leaderboardView='summary';localStorage.setItem('awayGolf13',JSON.stringify(store));nav('leaderboardPage')};
}
function markerTargetFor(pid,day){
 const ctx=playerGroupContext(pid,day);if(!ctx)return null;
 const g=ctx.group.filter(x=>String(x)!==NO_PARTNER_ID),me=String(pid),pos=g.indexOf(me);
 if(pos<0)return null;
 // Prefer the 4BBB partner because the two golfers naturally mark/verify each other.
 if((store.event.competitions||[]).includes('fourball')){
   const pairStart=ctx.playerIndex<2?0:2;
   const other=ctx.group.slice(pairStart,pairStart+2).map(String).find(x=>x!==me&&x!==NO_PARTNER_ID);
   if(other)return other;
 }
 return String(g[(pos+1)%g.length]||'');
}
function ntpHolesFor(day){return (store.event.ntpSelections?.['day'+day]||[]).map(Number)}
function currentNtpHolder(day,hole){
 const d=scoringDayStore(day);let best=null;
 Object.entries(d).forEach(([scorerId,holes])=>{const n=holes?.[String(hole)]?.ntp;if(n?.confirmedAt){const t=Date.parse(n.confirmedAt)||0,id=String(n.entrantId||scorerId);if(!best||t>best.t)best={id,t,at:n.confirmedAt}}});
 return best;
}
function renderTeamsPage(){
 const host=$('#teamsAdmin');
 if(!host)return;
 if(!store.event){
   host.innerHTML=`<div class="card"><h3>No event plan is ready yet.</h3><p>Create and save an event plan first.</p><button class="primary" id="teamsNewEvent">Create New Event</button></div>`;
   if($('#teamsNewEvent'))$('#teamsNewEvent').onclick=openWizard;
   return;
 }
 initialiseGroups();
 const locked=Boolean(store.event.locked);
 const day=Math.min(store.event.activeGroupDay||1,store.event.days||1),key='day'+day,setup=store.event.groupSetup[key],groups=setup.groups;
 const cname=course(day===1?store.event.course1:store.event.course2)?.name||'Course';
 const method=startMethodFor(store.event,day),ids=dayFieldIds(day),ctx=noPartnerContext(groups,day);
 const vp=setup.virtualPlayer?player(setup.virtualPlayer):null;
 const extra=setup.ntpExtraPlayer?player(setup.ntpExtraPlayer):null;
 const startControl=(gi)=>{
   if(method==='shotgun')return `<label class="startPos">Starting Hole<select data-groupstart="${gi}" ${locked?'disabled':''}>${Array.from({length:18},(_,i)=>`<option value="${i+1}" ${+setup.starts[gi]===i+1?'selected':''}>Hole ${i+1}</option>`).join('')}</select></label>`;
   if(method==='two'){const tees=store.event.twoTeeStarts?.['day'+day]||[1,10];return `<label class="startPos">Starting Hole<select data-groupstart="${gi}" ${locked?'disabled':''}>${tees.map(h=>`<option value="${h}" ${+setup.starts[gi]===+h?'selected':''}>Hole ${h}</option>`).join('')}</select></label>`;}
   if(method==='single')return `<span class="startOrder">Starting Hole ${startHolesFor(store.event,day)[0]}</span>`;return `<span class="startOrder">Tee order ${gi+1}</span>`;
 };
 const playerRow=(pid,gi,pi)=>{
   let p=player(pid),selected=String(store.event.swapPlayer||'')===String(pid),np=String(pid)===NO_PARTNER_ID;
   return `<div class="groupPlayer ${selected?'swapSelected':''} ${np?'noPartnerGroupPlayer':''}">
     <div class="slotNo">${pi+1}</div>
     <div class="groupPlayerName"><b>${esc(p?.name||'Unknown')}</b><small>${np?'Missing player position':esc(p?.golfLink||'')}</small></div>
     ${locked||np?'':`<button type="button" class="${selected?'primary':'soft'} swapBtn ${store.event.manualMode?'':'manualOff'}" data-swapplayer="${pid}">${selected?'Selected':'Swap'}</button>`}
   </div>`;
 };
 const pairName=id=>{
   if(String(id)===NO_PARTNER_ID)return `<span class="vpName">${esc(vp?.name||'Virtual Player')} (VP)</span>`;
   return esc(player(id)?.name||'');
 };
 const pairBlock=(g)=>{
   if(!(store.event.competitions||[]).includes('fourball'))return '';
   const one=g.slice(0,2).map(pairName).join(' & '),two=g.slice(2,4).map(pairName).join(' & ');
   return `<div class="partnerBlock"><div class="partnerHeading">Partners in 4BBB</div><div class="pairSummary"><span>${one||'—'}</span><span>${two||'—'}</span></div></div>`;
 };
 const allSaved=Array.from({length:store.event.days},(_,i)=>store.event.groupSetup['day'+(i+1)]?.saved).every(Boolean);
 const handicapsComplete=Array.from({length:store.event.days},(_,i)=>dayFieldIds(i+1).filter(x=>String(x)!==NO_PARTNER_ID).every(id=>playerDailyHandicap(id,i+1)!=null)).every(Boolean);
 const lockReady=allSaved&&handicapsComplete;
 const affected=ctx?.affected?player(ctx.affected):null;
 const shortNotice=ctx?`<div class="virtualNotice">
   <h4>Short Team Arrangement — Day ${day}</h4>
   <p>Due to fewer than the planned number of players being available for this event, <b>${esc(affected?.name||'the player')}</b> has been placed in a team with No Partner. <span class="vpName"><b>${esc(vp?.name||'Virtual Player')} (VP)</b></span> has been randomly selected as the Virtual Player.</p>
   <p>Where a partner or fourth team member's score is required, the Virtual Player's score will be used. The Virtual Player remains in their own playing group and is not entitled to any additional prize or required to make any additional Best 3 of 4 Lottery contribution because their score is also being used virtually.</p>
   ${extra?`<p><b>NTP Extra Shot:</b> ${esc(extra.name)} has been randomly selected from the three golfers in the short team. On each NTP hole that day, ${esc(extra.name)} may play two tee shots; either shot may qualify for the NTP.</p>`:''}
 </div>`:'';
 host.innerHTML=`<div class="teamsTop">
   <div><h2>Groups &amp; Teams</h2><h3>${esc(store.event.name)}</h3><p class="hint">${esc(cname)} · ${ids.length} positions · ${method==='shotgun'?'Shotgun':method==='two'?'Two Tees':'Single Tee'}${locked?' · EVENT LOCKED':''}</p></div>
   <div class="teamsTopActions">${store.event.days==2?`<div class="dayTabs" aria-label="Select event day"><button type="button" class="${day===1?'active':''}" data-groupday="1">Day 1</button><button type="button" class="${day===2?'active':''}" data-groupday="2">Day 2</button></div>`:''}${locked?'':`<button class="soft backToPlan" id="backToEventSetup">← Back to Event Setup</button>`}</div>
 </div>
 ${locked?`<div class="lockedBanner">🔒 Event Locked — planning and team setup can no longer be changed.</div>`:`<div class="teamsToolbar"><div class="drawMethods"><button class="${store.event.drawMode==='history'?'primary':'soft'}" id="historyBalanced">History Balanced</button><button class="${store.event.drawMode==='random'?'primary':'soft'}" id="randomiseGroups">Random</button><button class="${store.event.drawMode==='manual'?'primary':'soft'}" id="manualMode">Manual</button></div><div class="teamsStatus">${store.event.swapPlayer?'First player selected — now click Swap beside the player to exchange with.':store.event.drawMode==='manual'?'Manual mode active — click Swap beside any player to begin.':store.event.drawMode==='random'?'Random draw selected.':'History Balanced uses previous history and, on Day 2, strongly avoids repeating Day 1 combinations.'}</div></div>`}
 ${day===2&&!locked?`<div class="day2HistoryNote"><b>Day 2 balancing:</b> today's draw treats Day 1 groups and 4BBB partnerships as fresh history and gives them strong repeat penalties.</div>`:''}
 <div class="groupGrid">${groups.map((g,gi)=>`<div class="playingGroup">
   <div class="groupHead"><div><h4>Group ${gi+1}</h4><small>${g.filter(x=>String(x)!==NO_PARTNER_ID).length} actual player${g.filter(x=>String(x)!==NO_PARTNER_ID).length===1?'':'s'}${g.some(x=>String(x)===NO_PARTNER_ID)?' + No Partner':''}</small></div>${startControl(gi)}</div>
   <div class="groupPlayers">${g.map((pid,pi)=>playerRow(pid,gi,pi)).join('')}</div>
   ${ctx&&ctx.groupIndex===gi?`<div class="vpAssignment"><b>Virtual Player:</b> <span class="vpName">${esc(vp?.name||'Not selected')} (VP)</span>${extra?`<span class="ntpExtra"><b>NTP Extra Shot:</b> ${esc(extra.name)}</span>`:''}</div>`:''}
   ${!locked&&store.event.swapPlayer&&g.some(id=>String(id)===String(store.event.swapPlayer))?`<div class="manualHistory">${playerHistoryAgainstGroup(store.event.swapPlayer,g).map(h=>`<div><b>${esc(h.name)}</b><span>Played together ${h.played} time${h.played===1?'':'s'}${h.partners?` · 4BBB partners ${h.partners} time${h.partners===1?'':'s'}`:''}</span></div>`).join('')||'<span>No previous pairings in this group.</span>'}</div>`:''}
   ${pairBlock(g)}
 </div>`).join('')}</div>
 ${!locked?`<div class="dailyHandicapPanel"><div class="dailyHandicapHead"><div><b>Daily Handicaps — Day ${day}</b><span>Enter the playing handicap to be used for today's Stableford calculations.</span></div><span>${ids.filter(x=>String(x)!==NO_PARTNER_ID&&playerDailyHandicap(x,day)==null).length?'Complete before Lock Event':'✓ Complete'}</span></div><div class="dailyHandicapGrid">${ids.filter(x=>String(x)!==NO_PARTNER_ID).map(id=>`<label><span>${esc(player(id)?.name||'')}</span><input type="number" min="0" max="54" step="1" data-dailyhcp="${id}" value="${playerDailyHandicap(id,day)??''}" placeholder="Hcp"></label>`).join('')}</div></div>`:''}
 ${shortNotice}
 ${!locked&&store.event.swapPlayer?`<div class="swapAdvice"><b>Manual placement history — ${esc(player(store.event.swapPlayer)?.name||'Player')}</b><div class="swapAdviceGrid">${groups.map((g,gi)=>{let rows=playerHistoryAgainstGroup(store.event.swapPlayer,g.filter(x=>String(x)!==NO_PARTNER_ID)),tot=rows.reduce((n,r)=>n+r.played,0),pt=rows.reduce((n,r)=>n+r.partners,0);return`<div><strong>Group ${gi+1}</strong><span>Played with these players ${tot} time${tot===1?'':'s'}${pt?` · 4BBB partnered ${pt} time${pt===1?'':'s'}`:''}</span></div>`}).join('')}</div></div>`:''}
 <div class="groupsFoot">
   <div class="groupSaveState">${setup.saved?'✓ Day '+day+' groups saved':'Day '+day+' groups not yet saved'}</div>
   ${locked?'':`<button class="primary saveGroups" id="saveGroups">Save Day ${day} Groups</button>`}
 </div>
 ${locked?'':`<div class="lockEventPanel"><div><b>Final event control</b><span>The Event Plan remains editable until you deliberately lock it shortly before play.</span></div><button class="lockEventBtn" id="lockEvent" ${lockReady?'':'disabled'}>LOCK EVENT</button></div>`}`;

 $$('[data-groupday]').forEach(b=>b.onclick=()=>{store.event.activeGroupDay=+b.dataset.groupday;store.event.swapPlayer=null;localStorage.setItem('awayGolf13',JSON.stringify(store));renderTeamsPage()});
 if(locked)return;
 $('#backToEventSetup').onclick=reopenEventPlan;
 $('#historyBalanced').onclick=()=>{
   store.event.drawMode='history';store.event.manualMode=false;store.event.swapPlayer=null;
   setup.groups=historyBalancedGroups(ids,day);setup.starts=defaultStarts(setup.groups,method,day);setup.saved=false;ensureShortTeamSelections(setup,day);localStorage.setItem('awayGolf13',JSON.stringify(store));renderTeamsPage();
 };
 $('#randomiseGroups').onclick=()=>{
   store.event.drawMode='random';store.event.manualMode=false;store.event.swapPlayer=null;
   setup.groups=makeGroups(shuffleCopy(ids));setup.starts=defaultStarts(setup.groups,method,day);setup.saved=false;ensureShortTeamSelections(setup,day);localStorage.setItem('awayGolf13',JSON.stringify(store));renderTeamsPage();
 };
 $('#manualMode').onclick=()=>{store.event.drawMode='manual';store.event.manualMode=true;store.event.swapPlayer=null;localStorage.setItem('awayGolf13',JSON.stringify(store));renderTeamsPage()};
 $$('[data-swapplayer]').forEach(btn=>btn.onclick=()=>{
   store.event.drawMode='manual';store.event.manualMode=true;
   const id=String(btn.dataset.swapplayer);
   if(!store.event.swapPlayer){store.event.swapPlayer=id;localStorage.setItem('awayGolf13',JSON.stringify(store));renderTeamsPage();return}
   if(String(store.event.swapPlayer)===id){store.event.swapPlayer=null;localStorage.setItem('awayGolf13',JSON.stringify(store));renderTeamsPage();return}
   const first=String(store.event.swapPlayer);let a=null,b=null;
   for(let gi=0;gi<groups.length;gi++)for(let pi=0;pi<groups[gi].length;pi++){const pid=String(groups[gi][pi]);if(pid===first)a={gi,pi};if(pid===id)b={gi,pi}}
   if(a&&b){const tmp=groups[a.gi][a.pi];groups[a.gi][a.pi]=groups[b.gi][b.pi];groups[b.gi][b.pi]=tmp;setup.saved=false;ensureShortTeamSelections(setup,day)}
   store.event.swapPlayer=null;localStorage.setItem('awayGolf13',JSON.stringify(store));renderTeamsPage();
 });
 $$('[data-groupstart]').forEach(s=>s.onchange=()=>{setup.starts[+s.dataset.groupstart]=+s.value;setup.saved=false;save();renderTeamsPage()});
 $$('[data-dailyhcp]').forEach(inp=>inp.onchange=()=>{
   const id=String(inp.dataset.dailyhcp),h=eventDayHandicaps(day),val=inp.value===''?'':Math.max(0,Math.min(54,+inp.value||0));
   h[id]=val;
   if(day===1&&store.event.days===2){
     const d2=eventDayHandicaps(2);
     if(d2[id]===''||d2[id]==null)d2[id]=val;
   }
   localStorage.setItem('awayGolf13',JSON.stringify(store));renderTeamsPage()
 });
 $('#saveGroups').onclick=()=>{setup.saved=true;store.event.swapPlayer=null;ensureShortTeamSelections(setup,day);save();renderTeamsPage()};
 $('#lockEvent').onclick=()=>{
   if(!lockReady)return;
   if(confirm('LOCK EVENT now?\\n\\nAfter locking, players, competitions, rules and groups can no longer be changed.')){
     store.event.locked=true;store.event.status='locked';store.event.lockedAt=new Date().toISOString();save();renderTeamsPage();
   }
 };
}

function formatEventDate(iso,day=1){
 if(!iso)return'';
 let d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+day-1);
 return d.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
function playerGroupContext(pid,day){
 const setup=store.event?.groupSetup?.['day'+day];if(!setup)return null;
 for(let gi=0;gi<setup.groups.length;gi++){
   const g=setup.groups[gi].map(String),pi=g.indexOf(String(pid));
   if(pi>=0)return{setup,group:g,groupIndex:gi,playerIndex:pi};
 }
 return null;
}
function findOfficialForPlayer(day,playerId,hole){
 const d=scoringDayStore(day),pid=String(playerId);
 for(const [scorerId,holes] of Object.entries(d)){
   const r=holes?.[String(hole)];
   if(String(r?.official?.playerId||'')===pid&&r.official.gross!==''&&r.official.gross!=null)return{...r.official,scorerId};
 }
 return null;
}
function playerHoleEntry(day,playerId,hole){
 const own=scoringDayStore(day)?.[String(playerId)]?.[String(hole)]?.self;
 if(own&&(own.gross!==''&&own.gross!=null||own.putts!==''&&own.putts!=null))return own;
 return findOfficialForPlayer(day,playerId,hole);
}
function playerSurname(id){const n=String(player(id)?.name||'Player').trim().split(/\s+/);return n[n.length-1]||'Player'}
function renderRoundVerification(selected,day){
 requestRoundWakeLock();
 const host=$('#playerExperience'),ctx=playerGroupContext(selected,day),setup=ctx?.setup,c=course(day===1?store.event.course1:store.event.course2),v=version(c)||{};
 if(!ctx)return renderPlayerExperience();
 const start=setup.starts?.[ctx.groupIndex]||1,seq=scoreSequence(start),mine=scorerStore(day,selected);
 const rows=seq.map(h=>{
   const self=mine[String(h)]?.self||{},off=findOfficialForPlayer(day,selected,h),idx=h-1,par=+(v.par?.[idx]||0),indexVal=v.index?.[idx]??'',hcp=playerDailyHandicap(selected,day);
   const selfGross=self.gross??'',offGross=off?.gross??'';
   const bothEntered=off&&selfGross!==''&&selfGross!=null&&offGross!==''&&offGross!=null;
   const grossMatch=bothEntered&&String(offGross).toUpperCase()===String(selfGross).toUpperCase();
   const offPts=bothEntered?stablefordPoints(offGross,par,indexVal,hcp):null,selfPts=bothEntered?stablefordPoints(selfGross,par,indexVal,hcp):null;
   const pointsMatch=bothEntered&&offPts!=null&&selfPts!=null&&offPts===selfPts;
   return{h,self:selfGross,off:offGross,offPts,selfPts,match:grossMatch||pointsMatch};
 });
 const mismatches=rows.filter(r=>!r.match);
 host.innerHTML=`<div class="roundTop"><button class="soft" id="backToRound">← Back to Round</button><div><h2>Round Verification</h2><p>${esc(player(selected)?.name||'')} · Day ${day} · ${esc(c?.name||'Course')}</p></div></div>
 <div class="verifyCard"><h3>${mismatches.length?`${mismatches.length} hole${mismatches.length===1?'':'s'} need attention`:'All 18 scores agree'}</h3><p>Your score is compared with the official score entered for you by your marker.</p><div class="verifyRows">${rows.map(r=>`<div class="verifyRow ${r.match?'match':'mismatch'}"><b>Hole ${r.h}</b><span>Marker: ${r.off===''?'—':r.off}${r.offPts!=null?` (${r.offPts} pt${r.offPts===1?'':'s'})`:''}</span><span>You: ${r.self===''?'—':r.self}${r.selfPts!=null?` (${r.selfPts} pt${r.selfPts===1?'':'s'})`:''}</span><strong>${r.match?'✓':'!'}</strong></div>`).join('')}</div></div>
 ${mismatches.length?`<div class="verificationAdvice">Return to the relevant hole or ask your marker to correct the official score. Player/Marker scores on all 18 holes must agree for the round to be finalised.</div>`:`<button class="startRoundBtn" id="finaliseRound">FINALISE ROUND</button>`}`;
 $('#backToRound').onclick=()=>{store.event.playerRoundMode='scoring';save();renderPlayerExperience()};
 if($('#finaliseRound'))$('#finaliseRound').onclick=()=>{const at=new Date().toISOString();store.event.roundFinalised=store.event.roundFinalised||{};store.event.roundFinalised['day'+day]=store.event.roundFinalised['day'+day]||{};store.event.roundFinalised['day'+day][selected]=at;const round=scorerStore(day,selected);round._meta={...(round._meta||{}),finalisedAt:at};store.event.playerRoundMode='preview';releaseRoundWakeLock();localStorage.setItem('awayGolf13',JSON.stringify(store));queueCloudRound(day,selected);renderHome();alert('Round finalised for '+player(selected).name+'.');renderPlayerExperience()};
}
function renderHoleScoring(selected,day){
 requestRoundWakeLock();
 const host=$('#playerExperience'),p=player(selected),ctx=playerGroupContext(selected,day);if(!p||!ctx)return renderPlayerExperience();
 const setup=ctx.setup,c=course(day===1?store.event.course1:store.event.course2),v=version(c)||{},start=setup.starts?.[ctx.groupIndex]||1,seq=scoreSequence(start);
 let pos=Math.max(0,Math.min(17,store.event.playerHolePos||0)),hole=seq[pos],idx=hole-1,rec=scoreRecord(day,selected,hole),targetId=markerTargetFor(selected,day),target=player(targetId),hcpSelf=playerDailyHandicap(selected,day),hcpTarget=playerDailyHandicap(targetId,day);
 rec.official.playerId=targetId;rec.self.playerId=selected;
 const par=+v.par?.[idx]||'',indexVal=v.index?.[idx]??'',metres=v.metres?.[idx]||'';
 const ntp=ntpHolesFor(day).includes(hole),holder=currentNtpHolder(day,hole),holderName=holder?player(holder.id)?.name:'';
 const sfOff=stablefordPoints(rec.official.gross,par,indexVal,hcpTarget),sfSelf=stablefordPoints(rec.self.gross,par,indexVal,hcpSelf);
 const playedHoles=seq.slice(0,pos+1),round=scorerStore(day,selected);
 const running=(section,hcp,playerId)=>playedHoles.reduce((total,h)=>{const item=round[String(h)]?.[section]||{};if(section==='official'&&String(item.playerId||'')!==String(playerId||''))return total;const i=h-1,pts=stablefordPoints(item.gross,+(v.par?.[i]||0),v.index?.[i]??'',hcp),putts=item.putts===''||item.putts==null?0:(+item.putts||0);total.points+=pts==null?0:pts;total.putts+=putts;return total},{points:0,putts:0});
 const totalOff=running('official',hcpTarget,targetId),totalSelf=running('self',hcpSelf,selected);
 const eclecticOn=day===2&&(store.event.competitions||[]).includes('eclectic');
 const eclecticData=playerId=>{
   if(!eclecticOn)return null;
   const day1Course=course(store.event.course1),day1Version=version(day1Course)||{},day1Hcp=playerDailyHandicap(playerId,1);
   const points=h=>{const e=playerHoleEntry(1,playerId,h),i=h-1;return stablefordPoints(e?.gross,+(day1Version.par?.[i]||0),day1Version.index?.[i]??'',day1Hcp)};
   const day1Hole=points(hole),values=playedHoles.map(h=>{const d1=points(h),d2Entry=playerHoleEntry(2,playerId,h),i=h-1,d2=stablefordPoints(d2Entry?.gross,+(v.par?.[i]||0),v.index?.[i]??'',playerDailyHandicap(playerId,2));return d1==null&&d2==null?null:Math.max(d1??0,d2??0)});
   return{day1Hole,total:values.every(x=>x!=null)?values.reduce((a,b)=>a+b,0):null};
 };
 const scoreSummary=(current,total,playerId)=>{const ec=eclecticData(playerId);return`<div class="scoreSummary ${ec?'hasEclectic':''}"><small>SCORE</small><div class="runningScore"><span><em>Hole ${hole}</em><b>${current==null?'—':current}</b></span><span><em>Holes 1 - ${hole}</em><b>${total}</b></span>${ec?`<span><em>Day 1</em><b>${ec.day1Hole==null?'—':ec.day1Hole}</b></span><span><em>Eclectic Score<br>Hole 1 - ${hole}</em><b>${ec.total==null?'—':ec.total}</b></span>`:''}</div></div>`};
 const pairStart=ctx.playerIndex<2?0:2,pairIds=ctx.group.slice(pairStart,pairStart+2).map(String).filter(id=>id!==NO_PARTNER_ID),teamIds=ctx.group.map(String).filter(id=>id!==NO_PARTNER_ID);if(pairIds.length<2&&setup.virtualPlayer&&!pairIds.includes(String(setup.virtualPlayer)))pairIds.push(String(setup.virtualPlayer));if(teamIds.length<4&&setup.virtualPlayer&&!teamIds.includes(String(setup.virtualPlayer)))teamIds.push(String(setup.virtualPlayer));
 const puttsThrough=pid=>{let sum=0;for(const h of playedHoles){const e=playerHoleEntry(day,pid,h);if(e?.putts===''||e?.putts==null)return null;sum+=+e.putts||0}return sum};
 const pairDisplay=[String(targetId),String(selected)].filter((id,i,a)=>id&&a.indexOf(id)===i),individualPutts=pairDisplay.map(id=>({id,total:puttsThrough(id)}));
 const puttingOn=(store.event.competitions||[]).includes('teamPutts'),puttingFormat=store.event.puttingFormat==='pairs'?'pairs':'team',puttingIds=puttingFormat==='pairs'?pairIds:teamIds,puttingValues=puttingIds.map(puttsThrough),puttingTotal=puttingValues.every(x=>x!=null)?puttingValues.reduce((a,b)=>a+b,0):null;
 const puttsLine=`<b>Putts:</b> ${individualPutts.map(x=>`<span>${esc(playerSurname(x.id))} <strong>${x.total==null?'—':x.total}</strong></span>`).join(' ')}${puttingOn?`<span class="puttingAggregate">${puttingFormat==='pairs'?'Pairs':'Team'} Total <strong>${puttingTotal==null?'—':puttingTotal}</strong></span>`:''}${ntp?'<em>NTP</em>':''}`;
 const best3Hole=h=>{const i=h-1,values=teamIds.map(pid=>{const e=playerHoleEntry(day,pid,h);return stablefordPoints(e?.gross,+(v.par?.[i]||0),v.index?.[i]??'',playerDailyHandicap(pid,day))}).filter(x=>x!=null).sort((a,b)=>b-a);return values.length>=3?values.slice(0,3).reduce((a,b)=>a+b,0):null};
 const best3Current=best3Hole(hole),best3Values=playedHoles.map(best3Hole),best3Total=best3Values.every(x=>x!=null)?best3Values.reduce((a,b)=>a+b,0):null,best3On=(store.event.competitions||[]).includes('best3of4');
 const isExtra=String(setup.ntpExtraPlayer||'')===String(selected);
 const stepper=(id,label,value,base,min,max)=>{
   const has=value!==''&&value!=null,isGross=id.endsWith('Gross'),picked=isGross&&String(value).toUpperCase()==='P',val=picked?'P':(has?+value:+base);
   return`<div class="scoreStepperWrap ${isGross?'grossControl':'puttsControl'}"><small>${label}</small><div class="scoreStepper ${isGross?'scoreFour':''} ${has?'set':'unset'}"><button type="button" data-step="${id}" data-delta="-1">−</button><button type="button" class="stepValue" data-confirm="${id}" data-base="${base}">${val}</button><button type="button" data-step="${id}" data-delta="1">+</button>${isGross?`<button type="button" class="pickupBtn ${picked?'picked':''}" data-pickup="${id}" title="Pick up">P</button>`:''}</div></div>`};
 const timeText=rec.ntp?.confirmedAt?new Date(rec.ntp.confirmedAt).toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'}):'';
 host.innerHTML=`<div class="scoringPhone"><div class="scoreHero"><div><span>AWAY GOLF · DAY ${day}</span><h2>${esc(c?.name||'Course')}</h2><small class="awakeIndicator">${'wakeLock' in navigator?'Screen awake ✓':'Use phone screen-lock setting'}</small></div><button class="soft" id="exitRound">Exit</button></div>
 <div class="holeHero ${ntp?'isNtp':''}"><div><small>HOLE</small><strong>${hole}</strong></div><div><small>PAR</small><b>${par||'—'}</b></div><div><small>INDEX</small><b>${esc(indexVal||'—')}</b></div><div><small>METRES</small><b>${metres||'—'}</b></div><span class="livePuttsLine">${puttsLine}</span></div>
 ${best3On?`<div class="best3Live"><b>Best 3 of 4:</b><span>Hole ${hole} <strong>${best3Current==null?'—':best3Current}</strong></span><span>Holes 1 - ${hole} <strong>${best3Total==null?'—':best3Total}</strong></span></div>`:''}
 <div class="scoreEntryCard official"><div class="scoreEntryHead"><div><small>OFFICIAL SCORE</small><h3>${esc(target?.name||'Marker partner')}</h3></div>${scoreSummary(sfOff,totalOff.points,targetId)}</div><div class="scoreSteppers">${stepper('officialGross','Score',rec.official.gross,par||4,1,20)}${stepper('officialPutts','Putts',rec.official.putts,2,0,9)}</div></div>
 <div class="scoreEntryCard self"><div class="scoreEntryHead"><div><small>YOUR SCORE</small><h3>${esc(p.name)}</h3></div>${scoreSummary(sfSelf,totalSelf.points,selected)}</div><div class="scoreSteppers">${stepper('selfGross','Score',rec.self.gross,par||4,1,20)}${stepper('selfPutts','Putts',rec.self.putts,2,0,9)}</div></div>
 ${ntp?`<div class="ntpPlayCard"><div><b>Nearest the Pin — Hole ${hole}</b><span>${holder?`Current holder: ${esc(holderName||'Player')}`:'No name recorded yet'}${isExtra?' · You have the NTP extra shot today.':''}</span><strong>Did ${esc(target?.name||'your marker partner')} mark down as Nearest the Pin?</strong></div>${rec.ntp?.locked?`<button disabled>Entry locked</button>`:rec.ntp?.confirmedAt?`<div class="ntpConfirmed"><span class="ntpTime">🔒 ${esc(timeText)}</span><button class="soft" id="undoNtp">Undo</button></div>`:`<button class="primary ${rec.ntp?.pending?'confirming':''}" id="yesNtp">${rec.ntp?.pending?'CONFIRM YES':'YES'}</button>`}</div>`:''}
 <div class="holeNav"><button class="soft" id="prevHole" ${pos===0?'disabled':''}>← Previous</button><button class="primary" id="nextHole">${pos===17?'FINISH ROUND':'Next Hole →'}</button></div></div>`;
 const setField=(id,val)=>{const [section,key]=id.startsWith('official')?['official',id==='officialGross'?'gross':'putts']:['self',id==='selfGross'?'gross':'putts'];rec[section][key]=val;const round=scorerStore(day,selected);if(round._meta?.finalisedAt)delete round._meta.finalisedAt;if(store.event.roundFinalised?.['day'+day])delete store.event.roundFinalised['day'+day][selected];localStorage.setItem('awayGolf13',JSON.stringify(store));queueCloudRound(day,selected);renderHoleScoring(selected,day)};
 $$('[data-step]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.step,section=id.startsWith('official')?'official':'self',key=id.endsWith('Gross')?'gross':'putts',base=key==='gross'?(par||4):2,min=key==='gross'?1:0,max=key==='gross'?20:9,current=rec[section][key]===''||rec[section][key]==null||String(rec[section][key]).toUpperCase()==='P'?base:+rec[section][key];setField(id,Math.max(min,Math.min(max,current+(+btn.dataset.delta))))});
 $$('[data-pickup]').forEach(btn=>btn.onclick=()=>{setField(btn.dataset.pickup,'P')});
 $$('[data-confirm]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.confirm,section=id.startsWith('official')?'official':'self',key=id.endsWith('Gross')?'gross':'putts';if(rec[section][key]===''||rec[section][key]==null)setField(id,+btn.dataset.base)});
 $('#exitRound').onclick=()=>{store.event.playerRoundMode='preview';releaseRoundWakeLock();save();renderPlayerExperience()};
 if($('#yesNtp'))$('#yesNtp').onclick=()=>{if(!rec.ntp.pending){rec.ntp.pending=true}else{rec.ntp.pending=false;rec.ntp.entrantId=targetId;rec.ntp.confirmedAt=new Date().toISOString()}save();queueCloudRound(day,selected);renderHoleScoring(selected,day)};
 if($('#undoNtp'))$('#undoNtp').onclick=()=>{rec.ntp.confirmedAt=null;rec.ntp.entrantId=null;rec.ntp.pending=false;save();queueCloudRound(day,selected);renderHoleScoring(selected,day)};
 $('#prevHole').onclick=()=>{store.event.playerHolePos=Math.max(0,pos-1);save();renderHoleScoring(selected,day)};
 $('#nextHole').onclick=()=>{if(ntp&&rec.ntp.confirmedAt)rec.ntp.locked=true;if(pos===17){store.event.playerRoundMode='verify';save();renderRoundVerification(selected,day)}else{store.event.playerHolePos=pos+1;save();renderHoleScoring(selected,day)}};
}
function leaderboardPlayerPoints(day,pid){
 const v=version(course(day===1?store.event.course1:store.event.course2))||{},hcp=playerDailyHandicap(pid,day);
 return Array.from({length:18},(_,i)=>{const e=playerHoleEntry(day,pid,i+1);return stablefordPoints(e?.gross,+(v.par?.[i]||0),v.index?.[i]??'',hcp)});
}
function leaderboardPlayerGross(day,pid){return Array.from({length:18},(_,i)=>{const g=playerHoleEntry(day,pid,i+1)?.gross;return String(g).toUpperCase()==='P'||g===''||g==null?null:+g})}
function leaderboardUnits(day,type){
 const setup=store.event.groupSetup?.['day'+day],out=[];if(!setup)return out;
 (setup.groups||[]).forEach((raw,gi)=>{
  const group=raw.map(String),filled=group.map(id=>id===NO_PARTNER_ID?String(setup.virtualPlayer||''):id).filter(Boolean);
  if(type==='team')out.push({id:`d${day}g${gi}`,ids:[...new Set(filled)],name:`Group ${gi+1}`,detail:filled.map(id=>playerSurname(id)).join(', ')});
  else for(let n=0;n<4;n+=2){const ids=group.slice(n,n+2).map(id=>id===NO_PARTNER_ID?String(setup.virtualPlayer||''):id).filter(Boolean);if(ids.length)out.push({id:`d${day}g${gi}p${n/2}`,ids:[...new Set(ids)],name:ids.map(id=>player(id)?.name||'Player').join(' & '),detail:`Day ${day} · Group ${gi+1}`})}
 });return out;
}
const leaderSum=values=>values.reduce((n,x)=>n+(x==null?0:+x||0),0);
function leaderRow(id,name,detail,holes,target=18){return{id,name,detail,holes,total:leaderSum(holes),thru:holes.filter(x=>x!=null).length,target,cbHoles:holes}}
function leaderCountback(a,b,higher=true){
 const av=a.cbHoles||a.holes,bv=b.cbHoles||b.holes,cmp=(x,y)=>higher?y-x:x-y;
 for(const [s,e] of [[9,18],[12,18],[15,18]]){const c=cmp(leaderSum(av.slice(s,e)),leaderSum(bv.slice(s,e)));if(c)return c}
 for(let i=17;i>=0;i--){const c=cmp(av[i]??0,bv[i]??0);if(c)return c}return 0;
}
function rankLeaderRows(rows,higher=true,useCountback=false){
 rows.sort((a,b)=>{const started=(b.thru>0)-(a.thru>0);if(started)return started;const c=higher?b.total-a.total:a.total-b.total;return c||(useCountback?leaderCountback(a,b,higher):0)||a.name.localeCompare(b.name)});
 rows.forEach((r,i)=>{const prev=rows[i-1],next=rows[i+1],same=prev&&Boolean(prev.thru)===Boolean(r.thru)&&prev.total===r.total&&(!useCountback||leaderCountback(prev,r,higher)===0);r.rank=same?prev.rank:i+1;r.tied=Boolean(same||(next&&Boolean(next.thru)===Boolean(r.thru)&&next.total===r.total&&(!useCountback||leaderCountback(r,next,higher)===0)));r.cb=Boolean(useCountback&&r.thru&&i===0&&rows[1]?.thru&&rows[1].total===r.total&&leaderCountback(r,rows[1],higher)!==0)});return rows;
}
function leaderboardDefinitions(){
 const selected=new Set(store.event.competitions||[]),days=store.event.days||1,defs=[],add=(id,label,type,day=0,opts={})=>defs.push({id,label,type,day,scope:day||'overall',...opts});
 if(selected.has('single'))add('single-d1','Single Stableford','single',1,{countback:true});
 if(selected.has('combined')){
  add('single-d1','Single Stableford — Day 1','single',1,{countback:true,showOnDay2:true});
  add('single-d2','Single Stableford — Day 2','single',2,{countback:true});
  add('combined','Single Stableford — 2 Days','combined',0,{countback:true});
 }
 for(let day=1;day<=days;day++){
  if(selected.has('fourball'))add(`fourball-d${day}`,`4BBB — Day ${day}`,'fourball',day,{countback:true});
  if(selected.has('teamPutts'))add(`putts-d${day}`,`${store.event.puttingFormat==='pairs'?'Pairs':'Team'} Putting — Day ${day}`,'putts',day,{lower:true});
  if(selected.has('best3of4'))add(`best3-d${day}`,`Best 3 of 4 — Day ${day}`,'best3',day);
  if(selected.has('scratch'))add(`scratch-d${day}`,`Scratch — Day ${day}`,'scratch',day,{lower:true,countback:true});
  if(selected.has('ntp'))add(`ntp-d${day}`,`Nearest the Pin — Day ${day}`,'ntp',day);
 }
 if(selected.has('par3')){if(days===2&&store.event.par3Format==='aggregate')add('par3-agg','Par 3 Pairs — 2 Days','par3aggregate');else for(let day=1;day<=days;day++)add(`par3-d${day}`,`Par 3 Pairs — Day ${day}`,'par3',day)}
 if(selected.has('eclectic'))add('eclectic','Eclectic — 2 Days','eclectic',0,{countback:true});
 return defs;
}
function calculateLeaderboard(def){
 const field=day=>dayFieldIds(day).filter(id=>String(id)!==NO_PARTNER_ID).map(String),points=(day,id)=>leaderboardPlayerPoints(day,id),gross=(day,id)=>leaderboardPlayerGross(day,id);let rows=[];
 if(def.type==='single')rows=field(def.day).map(id=>leaderRow(id,player(id)?.name||'Player','',points(def.day,id)));
 if(def.type==='combined')rows=field(1).filter(id=>field(2).includes(id)).map(id=>{const d1=points(1,id),d2=points(2,id),r=leaderRow(id,player(id)?.name||'Player','Day 1 + Day 2',[...d1,...d2],36);r.cbHoles=d2;return r});
 if(def.type==='scratch')rows=field(def.day).map(id=>leaderRow(id,player(id)?.name||'Player','',gross(def.day,id)));
 if(def.type==='fourball')rows=leaderboardUnits(def.day,'pair').map(u=>leaderRow(u.id,u.name,u.detail,Array.from({length:18},(_,i)=>{const vals=u.ids.map(id=>points(def.day,id)[i]).filter(x=>x!=null);return vals.length?Math.max(...vals):null})));
 if(def.type==='putts'){const kind=store.event.puttingFormat==='pairs'?'pair':'team';rows=leaderboardUnits(def.day,kind).map(u=>leaderRow(u.id,u.name,u.detail,Array.from({length:18},(_,i)=>{const vals=u.ids.map(id=>playerHoleEntry(def.day,id,i+1)?.putts).map(x=>x===''||x==null?null:+x);return vals.every(x=>x!=null)?leaderSum(vals):null})))}
 if(def.type==='best3')rows=leaderboardUnits(def.day,'team').map(u=>leaderRow(u.id,u.name,u.detail,Array.from({length:18},(_,i)=>{const vals=u.ids.map(id=>points(def.day,id)[i]).filter(x=>x!=null).sort((a,b)=>b-a);return vals.length>=3?leaderSum(vals.slice(0,3)):null})));
 if(def.type==='par3'){const v=version(course(def.day===1?store.event.course1:store.event.course2))||{},ix=Array.from({length:18},(_,i)=>i).filter(i=>+v.par?.[i]===3);rows=leaderboardUnits(def.day,'pair').map(u=>leaderRow(u.id,u.name,u.detail,ix.map(i=>{const vals=u.ids.map(id=>points(def.day,id)[i]);return vals.every(x=>x!=null)?leaderSum(vals):null}),ix.length))}
 if(def.type==='par3aggregate'){const ix=d=>{const v=version(course(d===1?store.event.course1:store.event.course2))||{};return Array.from({length:18},(_,i)=>i).filter(i=>+v.par?.[i]===3)};rows=leaderboardUnits(2,'pair').map(u=>{const holes=[];for(const d of [1,2])ix(d).forEach(i=>{const vals=u.ids.map(id=>points(d,id)[i]);holes.push(vals.every(x=>x!=null)?leaderSum(vals):null)});return leaderRow(u.id,u.name,'Day 2 partnership · both rounds',holes,holes.length)})}
 if(def.type==='eclectic')rows=field(1).filter(id=>field(2).includes(id)).map(id=>leaderRow(id,player(id)?.name||'Player','Best score on each hole',Array.from({length:18},(_,i)=>{const vals=[points(1,id)[i],points(2,id)[i]].filter(x=>x!=null);return vals.length?Math.max(...vals):null})));
 return rankLeaderRows(rows,!def.lower,Boolean(def.countback));
}
function leaderboardComplete(def,rows){
 const dayFinal=day=>{const field=dayFieldIds(day).filter(id=>String(id)!==NO_PARTNER_ID);return Boolean(field.length&&field.every(id=>roundFinalisedFor(day,id)))};
 const finalised=def.day?dayFinal(def.day):(store.event.days===2?dayFinal(1)&&dayFinal(2):dayFinal(1));
 if(def.type==='ntp')return finalised&&dayFieldIds(def.day).filter(id=>String(id)!==NO_PARTNER_ID).every(id=>leaderboardPlayerPoints(def.day,id).every(x=>x!=null));
 return Boolean(finalised&&rows.length&&rows.every(r=>r.thru===r.target));
}
function summaryCompetitionResult(def){
 if(def.type==='ntp'){const holders=ntpHolesFor(def.day).map(h=>({hole:h,holder:currentNtpHolder(def.day,h)})),complete=leaderboardComplete(def,[]);return{complete,text:holders.length?holders.map(x=>`Hole ${x.hole}: ${x.holder?player(x.holder.id)?.name||'Player':'Pending'}`).join(' · '):'Pending'}}
 const rows=calculateLeaderboard(def),top=rows[0],complete=leaderboardComplete(def,rows);if(!top||!top.thru)return{complete:false,text:'Not started'};
 return{complete,text:`${top.name} — ${top.total} ${def.type==='scratch'?'strokes':def.type==='putts'?'putts':'pts'}${top.cb?' CB':''}`};
}
function leaderboardBenefitId(def){
 if(def.type==='single')return(store.event.competitions||[]).includes('combined')?'combined':'single';
 return({combined:'combined',fourball:'fourball',putts:'teamPutts',best3:'best3of4',scratch:'scratch',ntp:'ntp',par3:'par3',par3aggregate:'par3',eclectic:'eclectic'})[def.type]||def.type;
}
function summaryPrizeDetails(def){const id=leaderboardBenefitId(def),text=competitionBenefitText(id,store.event.benefits),configured=text!=='Prize not set';return{id,text,configured,awarded:Boolean(store.event.prizesAwarded?.[def.id])}}
async function setPrizeAwarded(defId,awarded){
 store.event.prizesAwarded=store.event.prizesAwarded||{};
 if(awarded)store.event.prizesAwarded[defId]={awardedAt:new Date().toISOString()};else delete store.event.prizesAwarded[defId];
 localStorage.setItem('awayGolf13',JSON.stringify(store));renderLeaderboard();
 if(store.cloud?.role==='organiser'&&store.cloud?.eventId)await updateCloudEvent();
}
function renderLeaderboardSummary(host,defs,viewTabs){
 const groups=[{title:'Day 1 Results',defs:defs.filter(d=>d.scope===1)},{title:'Day 2 Results',defs:defs.filter(d=>d.scope===2)},{title:'Overall Event Results',defs:defs.filter(d=>d.scope==='overall')}].filter(g=>g.defs.length);
 const organiser=store.cloud?.role!=='player';
 host.innerHTML=`<div class="leaderHead"><div><h2>Results Summary</h2><p>${esc(store.event.name)} · winners and prize giving</p></div><button class="soft leaderRefresh" id="leaderRefresh">Refresh</button></div>${viewTabs}<div class="summaryGroups">${groups.map(g=>`<section class="summaryCard"><h3>${g.title}</h3>${g.defs.map(d=>{const r=summaryCompetitionResult(d),p=summaryPrizeDetails(d);return`<div class="summaryResult ${p.awarded?'awarded':''}" data-summaryopen="${d.id}" role="button" tabindex="0"><span class="summaryEvent"><b>${esc(d.label)}</b><small>${r.complete?'Winner':'In progress'}</small></span><span class="summaryOutcome"><strong>${esc(r.text)}</strong><small class="summaryPrize ${p.configured?'':'notSet'}">Prize: ${esc(p.text)}</small></span><span class="summaryActions">${p.awarded?`<button class="prizeAwarded" data-prizeaward="${d.id}" data-awarded="1">✓ Awarded</button>`:(organiser&&r.complete&&p.configured?`<button class="prizeAward" data-prizeaward="${d.id}">Award Prize</button>`:'')}<em>›</em></span></div>`}).join('')}</section>`).join('')}</div><p class="leaderNote">Tap a result to open its full standings. Awarded prizes remain recorded here and are shared with connected phones.</p>`;
 $$('[data-summaryopen]').forEach(b=>{const open=()=>{const d=defs.find(x=>x.id===b.dataset.summaryopen);store.event.leaderboardView=d?.scope==='overall'?(store.event.days===2?2:1):d?.scope||1;store.event.leaderboardTab=b.dataset.summaryopen;localStorage.setItem('awayGolf13',JSON.stringify(store));renderLeaderboard()};b.onclick=e=>{if(!e.target.closest('[data-prizeaward]'))open()};b.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('[data-prizeaward]')){e.preventDefault();open()}}});
 $$('[data-prizeaward]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const wasAwarded=b.dataset.awarded==='1';if(wasAwarded&&!confirm('Change this prize back to not yet awarded?'))return;await setPrizeAwarded(b.dataset.prizeaward,!wasAwarded)});$('#leaderRefresh').onclick=async()=>{await syncCloudNow();renderLeaderboard()};
}
function renderLeaderboard(){
 const host=$('#leaderboardExperience');if(!host)return;if(!store.event){host.innerHTML='<div class="card"><h2>Leaderboard</h2><p>Create an event first.</p></div>';return}
 const defs=leaderboardDefinitions();if(!defs.length){host.innerHTML='<div class="card"><h2>Leaderboard</h2><p>No scored competitions were selected for this event.</p></div>';return}
 const days=store.event.days||1;let view=store.event.leaderboardView||Math.min(days,store.event.playerPreviewDay||store.event.activeGroupDay||1);if(days===1)view=1;store.event.leaderboardView=view;
 const viewTabs=days===2?`<div class="leaderViewTabs"><button data-leaderview="1" class="${view==1?'active':''}">Day 1</button><button data-leaderview="2" class="${view==2?'active':''}">Day 2</button><button data-leaderview="summary" class="${view==='summary'?'active':''}">Summary</button></div>`:`<div class="leaderViewTabs"><button data-leaderview="1" class="${view==1?'active':''}">Today</button><button data-leaderview="summary" class="${view==='summary'?'active':''}">Summary</button></div>`;
 if(view==='summary'){renderLeaderboardSummary(host,defs,viewTabs);$$('[data-leaderview]').forEach(b=>b.onclick=()=>{store.event.leaderboardView=b.dataset.leaderview==='summary'?'summary':+b.dataset.leaderview;localStorage.setItem('awayGolf13',JSON.stringify(store));renderLeaderboard()});return}
 const visible=defs.filter(d=>d.scope===+view||d.scope==='overall'||(+view===2&&d.showOnDay2));let active=store.event.leaderboardTab||visible[0]?.id;if(!visible.some(d=>d.id===active))active=visible[0]?.id;store.event.leaderboardTab=active;const def=visible.find(d=>d.id===active);
 const tabs=`<div class="leaderTabs">${visible.map(d=>`<button data-leadertab="${d.id}" class="${d.id===active?'active':''}">${esc(d.label)}</button>`).join('')}</div>`;
 let body='';if(def.type==='ntp'){body=ntpHolesFor(def.day).map(h=>{const holder=currentNtpHolder(def.day,h);return`<div class="leaderRow ntpLeaderRow"><b>Hole ${h}</b><span class="leaderName">${holder?esc(player(holder.id)?.name||'Player'):'No confirmed holder yet'}</span></div>`}).join('')||'<div class="leaderEmpty">No NTP holes selected.</div>'}
 else{const rows=calculateLeaderboard(def),unit=def.type==='scratch'?'strokes':def.type==='putts'?'putts':'pts';body=rows.map((r,i)=>`<div class="leaderRow ${i===0&&r.thru?'winner':''}"><span class="leaderRank">${r.tied?'T':''}${r.rank}</span><span class="leaderName">${esc(r.name)}${r.detail?`<small>${esc(r.detail)}</small>`:''}</span><span class="leaderScore">${r.total} <small>${unit}</small>${r.cb?' <small>CB</small>':''}</span><span class="leaderThru">${r.thru===r.target?'Final':r.thru?'Thru '+r.thru:'Not started'}</span></div>`).join('')||'<div class="leaderEmpty">No players are available.</div>'}
 host.innerHTML=`<div class="leaderHead"><div><h2>Live Leaderboard</h2><p>${esc(store.event.name)} · updates as scores arrive</p></div><button class="soft leaderRefresh" id="leaderRefresh">Refresh</button></div>${viewTabs}${tabs}<div class="leaderCard"><div class="leaderTitle"><h3>${esc(def.label)}</h3><span>${def.countback?'Automatic countback':'Live standings'}</span></div>${body}</div><p class="leaderNote">Scores marked Final have all required holes entered. CB means the winner was decided by countback.</p>`;
 $$('[data-leaderview]').forEach(b=>b.onclick=()=>{store.event.leaderboardView=b.dataset.leaderview==='summary'?'summary':+b.dataset.leaderview;store.event.leaderboardTab='';localStorage.setItem('awayGolf13',JSON.stringify(store));renderLeaderboard()});$$('[data-leadertab]').forEach(b=>b.onclick=()=>{store.event.leaderboardTab=b.dataset.leadertab;localStorage.setItem('awayGolf13',JSON.stringify(store));renderLeaderboard()});$('#leaderRefresh').onclick=async()=>{await syncCloudNow();renderLeaderboard()};
}
function renderPlayerExperience(){
 const host=$('#playerExperience');if(!host)return;
 if(!store.event){host.innerHTML='<div class="card"><h2>Player View</h2><p>Create an event plan first.</p></div>';return}
 initialiseGroups();
 const days=store.event.days||1;let day=Math.min(store.event.playerPreviewDay||1,days);let field=dayFieldIds(day).filter(id=>String(id)!==NO_PARTNER_ID);if(store.cloud?.role==='player')field=field.filter(id=>String(id)===String(store.cloud.playerId));let selected=String(store.event.playerPreviewId||field[0]||'');if(!field.includes(selected))selected=String(field[0]||'');
 store.event.playerPreviewDay=day;store.event.playerPreviewId=selected;
 if(store.event.playerRoundMode==='scoring')return renderHoleScoring(selected,day);
 if(store.event.playerRoundMode==='verify')return renderRoundVerification(selected,day);
 const p=player(selected),ctx=playerGroupContext(selected,day);if(!p||!ctx){host.innerHTML='<div class="card"><h2>Player View</h2><p>No player is available for this day.</p></div>';return}
 const g=ctx.group,setup=ctx.setup,c=course(day===1?store.event.course1:store.event.course2),start=setup.starts?.[ctx.groupIndex],startText=`Hole ${start}`;let partner=null;
 if((store.event.competitions||[]).includes('fourball')){const pairStart=ctx.playerIndex<2?0:2;let other=g.slice(pairStart,pairStart+2).find(id=>id!==selected);if(other===NO_PARTNER_ID&&setup.virtualPlayer)partner=player(setup.virtualPlayer);else partner=player(other)}
 const isAffected=(()=>{const np=noPartnerContext(setup.groups,day);return np&&String(np.affected)===selected?np:null})();const isExtra=String(setup.ntpExtraPlayer||'')===selected,rules=store.event.specialRules||'';
 let displayIds=[selected];
 if(partner){const partnerActual=g.find(id=>String(id)!==selected&&player(id)?.name===partner.name);if(partnerActual)displayIds.push(String(partnerActual));}
 g.map(String).forEach(id=>{if(!displayIds.includes(id))displayIds.push(id)});displayIds=displayIds.slice(0,4);
 const groupNames=displayIds.map(id=>({id,name:id===NO_PARTNER_ID?'No Partner':player(id)?.name||'Unknown'}));
 const ack=Boolean(store.event.playerPreviewAck?.[day]?.[selected]),hcp=playerDailyHandicap(selected,day),canStart=Boolean(store.event.locked&&ack&&hcp!=null),rulesOpen=Boolean(store.event.playerRulesOpen);
 host.innerHTML=`<div class="playerPreviewTop"><div><h2>Player View</h2><p>Phone preview — select a golfer to see exactly what that player will see.</p></div><div class="playerPreviewControls"><select id="previewPlayer">${field.map(id=>`<option value="${id}" ${id===selected?'selected':''}>${esc(player(id)?.name||'')}</option>`).join('')}</select>${days===2?`<div class="previewDayTabs" aria-label="Select scoring day"><button type="button" class="${day===1?'active':''}" data-previewday="1">Day 1</button><button type="button" class="${day===2?'active':''}" data-previewday="2">Day 2</button></div>`:''}</div></div>
 <div class="phoneShell"><div class="phoneScreen"><div class="playerEventHero"><span>AWAY GOLF</span><h1>${esc(store.event.name)}</h1><h3>DAY ${day}</h3><p>${esc(c?.name||'Course')}</p><small>${esc(formatEventDate(store.event.date,day))}</small></div>
 <div class="playerCard"><div class="playerCardTitle">YOUR GOLF</div><div class="playerFacts twoFacts"><div><small>Daily Handicap</small><b>${hcp==null?'—':hcp}</b></div><div><small>Starting Tee</small><b>${esc(startText)}</b></div></div></div>
 <div class="playerCard"><div class="playerCardTitle"><strong>${esc(p.name)}</strong> — GROUP ${ctx.groupIndex+1}</div><div class="phoneGroup">${groupNames.map(n=>`<div class="${n.name==='No Partner'?'np':''} ${String(n.id)===selected?'you':''}">${esc(n.name)}</div>`).join('')}</div>${partner?`<div class="phonePartner"><small>YOUR 4BBB PARTNER</small><b class="${isAffected?'vpName':''}">${esc(partner.name)}${isAffected?' (VP)':''}</b></div>`:''}</div>
 ${(isAffected||isExtra)?`<div class="specialInstruction"><strong>TODAY'S SPECIAL INSTRUCTIONS</strong>${isAffected?`<p>You have <b>No Partner</b> in your playing group. <span class="vpName">${esc(player(setup.virtualPlayer)?.name||'Virtual Player')} (VP)</span> supplies the missing score where a partner or fourth team member is required.</p>`:''}${isExtra?`<p><b>NTP Extra Shot:</b> You may play <b>two tee shots</b> on each NTP hole today. Either shot may qualify.</p>`:''}</div>`:''}
 <button class="playerRulesBtn" id="playerRulesBtn">Competitions &amp; Rules <span>${rulesOpen?'⌃':'›'}</span></button>${rulesOpen?`<div class="playerRulesPanel"><h4>Competitions</h4><div class="playerCompetitionList">${(store.event.competitions||[]).map(id=>`<div data-competition="${id}"><span>${esc(id==='teamPutts'?`Putting Competition (${store.event.puttingFormat==='pairs'?'2 Player':'4 Player'})`:competitionNames[id]||id)}</span><b>${esc(competitionBenefitText(id,store.event.benefits))}</b></div>`).join('')}</div><h4>Special Rules</h4><p>${rules?esc(rules).replace(/\n/g,'<br>'):'No additional special rules for this event.'}</p></div>`:''}<div class="playerAck"><div><b>Rules acknowledgement</b><small>Read today's rules before starting.</small></div><button id="playerGotIt" class="${ack?'done':''}">${ack?'✓ Got It':'Got It'}</button></div>
 <button class="startRoundBtn" id="startRoundPreview" ${canStart?'':'disabled'}>${!store.event.locked?'EVENT NOT YET LOCKED':hcp==null?'DAILY HANDICAP NOT SET':!ack?'TAP GOT IT TO START':'START ROUND'}</button>${!canStart?'<p class="lockHint">The round opens when the event is locked, your Daily Handicap is set and you have acknowledged the rules.</p>':''}</div></div>`;
 $('#previewPlayer').onchange=e=>{store.event.playerPreviewId=e.target.value;save();renderPlayerExperience()};$$('[data-previewday]').forEach(b=>b.onclick=()=>{store.event.playerPreviewDay=+b.dataset.previewday;store.event.playerPreviewId=null;store.event.playerRoundMode='preview';save();renderPlayerExperience()});
 $('#playerRulesBtn').onclick=()=>{store.event.playerRulesOpen=!rulesOpen;save();renderPlayerExperience()};
 $('#playerGotIt').onclick=()=>{store.event.playerPreviewAck=store.event.playerPreviewAck||{};store.event.playerPreviewAck[day]=store.event.playerPreviewAck[day]||{};store.event.playerPreviewAck[day][selected]=true;save();renderPlayerExperience()};
 $('#startRoundPreview').onclick=()=>{if(!canStart)return;store.event.playerRoundMode='scoring';store.event.playerHolePos=0;requestRoundWakeLock();save();renderPlayerExperience()};
}
applyDeviceRole();renderHome();renderPlayersAdmin();renderCoursesAdmin();initialiseCloud();
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
