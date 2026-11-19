import {createMatchplayConnection} from './matchplay-connection.mjs';
const host=document.getElementById('connectedHost'),status=document.getElementById('connectionStatus'),controls=document.getElementById('connectionControls');
let session,connection,event,started=false,timer,delay=2500,inFlight=false,paused=false,lastStatus='loading';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(action,command){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);try{const response=await fetch('/api/matchplay-review',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{})},body:JSON.stringify({action,...(action==='join'?{role:command,code:document.getElementById('testCode').value.trim().toUpperCase()}:{command})}),signal:controller.signal});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{code:result.code,status:response.status});return result;}finally{clearTimeout(timeout);}}
function showStatus(value){lastStatus=value;const text={loading:'Connecting to shared review…',connected:'Connected · shared cloud save',sending:'Sending entry…',pending:'Entry saved on this device · waiting to send',conflict:'New scores arrived · review your unsent entry',offline:'Connection unavailable · retrying',paused:'Updates paused on this screen'};status.textContent=text[value]||value;status.dataset.status=value;controls.hidden=!['pending','conflict','offline'].includes(value);}
let lastRevision=null;
function install(snapshot){
 if(started&&snapshot.revision===lastRevision)return;lastRevision=snapshot.revision;
 if(!event)event={name:'Connected Match Play test',matchplay:{draws:{'men-1':snapshot.state}}};else event.matchplay.draws['men-1']=snapshot.state;
 if(!started){started=true;GolfMatchplayView.start({host,event,grades:[{id:'men-1',name:'Men’s Club Championship'}],connected:session,leaderboard:session.role==='spectator',save:()=>{throw Error('Connected scores must be saved by the server.');},draw:()=>location.assign('/connected-review'),command:async command=>{if(connection.pending)throw Error('Resolve your pending entry before entering another score.');await connection.enqueue(command);}});}else GolfMatchplayView.update(snapshot.state);
 showStatus('connected');
}
async function tick(){if(paused||document.hidden)return schedule();if(inFlight)return;inFlight=true;try{if(connection.pending){if(lastStatus!=='conflict')await connection.flush();}else await connection.refresh();delay=2500;if(!connection.pending)showStatus('connected');}catch(e){delay=Math.min(30000,Math.max(5000,delay*2));if(e.code==='revision_conflict')showStatus('conflict');else showStatus(connection.pending?'pending':'offline');}finally{inFlight=false;schedule();}}
function schedule(){clearTimeout(timer);timer=setTimeout(tick,delay);}
async function open(selected){
 showStatus('loading');session=selected;connection=createMatchplayConnection({request:api,storage:localStorage,key:'away-connected-'+session.token,onState:install,onStatus:showStatus});
 document.getElementById('joinViews').hidden=true;document.getElementById('currentRole').textContent=session.role==='spectator'?'Spectator':session.roleName||'Player view';
 // Restore unsent entries before fetching so a lost response can replay its receipt.
 try{if(connection.pending)await connection.flush();else await connection.refresh();}catch(e){showStatus(e.code==='revision_conflict'?'conflict':connection.pending?'pending':'offline');}schedule();
}
document.querySelectorAll('[data-join]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const joined=await api('join',button.dataset.join);sessionStorage.setItem('away-connected-session',JSON.stringify(joined));await open(joined);}catch(e){showStatus(e.message);}finally{button.disabled=false;}});
document.getElementById('retryConnection').onclick=()=>tick();
document.getElementById('reviewPending').onclick=async()=>{try{const review=await connection.reviewConflict();document.getElementById('pendingDetails').innerHTML='<h3>Your unsent entry</h3>'+review.pending.map(c=>'<p>'+escape(c.operation)+' · '+escape(c.key)+' · Hole '+escape(c.hole||'—')+' · '+escape(c.kind||'')+' '+escape(c.value??'')+'</p>').join('')+'<p>The latest shared match will be loaded. Your unsent entry will be removed only if you press the button below. Re-enter it after reviewing the match.</p>';document.getElementById('pendingPanel').hidden=false;}catch(e){showStatus(e.message);}};
document.getElementById('discardPending').onclick=async()=>{try{await connection.discardPendingAndReload();document.getElementById('pendingPanel').hidden=true;}catch(e){showStatus(e.message);}};
document.getElementById('pauseUpdates').onclick=e=>{paused=!paused;e.target.textContent=paused?'Resume updates':'Pause updates';showStatus(paused?'paused':'loading');if(!paused)tick();};
document.getElementById('changeView').onclick=()=>{if(connection?.pending){showStatus('Review the pending entry before changing view.');return;}connection?.stop();clearTimeout(timer);sessionStorage.removeItem('away-connected-session');location.reload();};
document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)tick();});window.addEventListener('pagehide',()=>{connection?.stop();clearTimeout(timer);});window.addEventListener('online',()=>tick());
try{const saved=JSON.parse(sessionStorage.getItem('away-connected-session')||'null');if(saved)open(saved);else showStatus('Choose a view to connect.');}catch{showStatus('Browser storage is unavailable. Enable it to test safely.');}
