import {resultBasis} from './matchplay-command-basis.mjs';
export function createMatchplayConnection({request,storage,key,playerSide,onState=()=>{},onStatus=()=>{}}){
 let saved=JSON.parse(storage.getItem(key)||'{"revision":null,"queue":[]}'),busy=false,stopped=false,work=null;
 const persist=()=>storage.setItem(key,JSON.stringify(saved));
 function field(c,state){const side=playerSide?.(state,c.key);return !side?null:c.kind==='own'?(side==='a'?'selfA':'selfB'):(side==='a'?'markerB':'markerA');}
 function projected(){const state=structuredClone(saved.state);for(const c of saved.queue){if(c.operation!=='score')continue;const f=field(c,state),match=state.matches[c.key];if(f&&match){match.holes[c.hole]??={};match.holes[c.hole][f]=c.value;}}return state;}
 function publish(){if(saved.state)onState({revision:saved.revision,state:projected(),pending:saved.queue.length});}
 function install(snapshot){saved.revision=snapshot.revision;saved.state=snapshot.state;persist();publish();}
 async function refresh(){if(busy||stopped||saved.queue.length)return false;busy=true;try{work=request('read');install(await work);return true;}finally{busy=false;work=null;}}
 async function flush(){
  if(stopped)return;if(busy){try{await work;}catch{}if(busy)await Promise.resolve();return flush();}
  busy=true;
  try{while(saved.queue.length&&!stopped){
   const entry=saved.queue[0];onStatus('sending');
   if(entry.expectedRevision==null){entry.expectedRevision=saved.revision;persist();}
   let result;try{work=request('command',entry);result=await work;}catch(error){onStatus(error.code&&error.code!=='server_error'?'conflict':'pending');throw error;}
   saved.queue.shift();install(result);onStatus(saved.queue.length?'pending':'connected');
  }}finally{busy=false;work=null;}
 }
 return {refresh,flush,
  async enqueue(command){
   if(saved.revision==null)throw Error('Load the current match before entering scores.');
   const item={...command,requestId:crypto.randomUUID()},state=projected();
   if(item.operation==='score'){const f=field(item,state);if(f)item.baseValue=state.matches[item.key].holes[item.hole]?.[f]??null;}
   if(item.operation==='confirm_result')item.basis=resultBasis(state,item.key);
   if(item.operation==='confirm_concession')item.basis=JSON.stringify(state.matches[item.key].holes[item.hole]?.pendingConcession||null);
   saved.queue.push(item);try{persist();}catch(error){saved.queue.pop();throw error;}
   publish();onStatus('pending');await flush();
  },
  async reviewConflict(){if(busy)throw Error('Wait for the current save to finish.');return {pending:structuredClone(saved.queue),latest:await request('read')};},
  async discardPendingAndReload(){if(busy)throw Error('Wait for the current save to finish.');const latest=await request('read'),previous=structuredClone(saved);saved.queue=[];try{install(latest);}catch(error){saved=previous;throw error;}onStatus('connected');},
  stop(){stopped=true;},get pending(){return saved.queue.length;}
 };
}
