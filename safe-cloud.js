(() => {
  "use strict";
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const equal = (a,b) => {
    if(a===b)return true;
    if(Array.isArray(a)&&Array.isArray(b)){
      if(a.length!==b.length)return false;
      if(a.length&&[a,b].every(v=>v.every(x=>object(x)&&x.id!==undefined)&&new Set(v.map(x=>String(x.id))).size===v.length))return a.every(x=>b.some(y=>String(x.id)===String(y.id)&&equal(x,y)));
      return a.every((v,i)=>equal(v,b[i]));
    }
    if(object(a)&&object(b)){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));}
    return false;
  };
  function merge(base,local,remote,path=[]) {
    if(equal(local,remote))return {data:copy(local),conflicts:[]};
    if(equal(local,base))return {data:copy(remote),conflicts:[]};
    if(equal(remote,base))return {data:copy(local),conflicts:[]};
    const last=path.at(-1);
    if(["furthestPos"].includes(last) && [base,local,remote].every(v=>v===undefined||typeof v==="number"))return {data:Math.max(local||0,remote||0),conflicts:[]};
    if(["finalUpdateAt","finalUpdateCloudSentAt","finalisedAt"].includes(last) && typeof local==="string"&&typeof remote==="string")return {data:local>remote?local:remote,conflicts:[]};
    if(Array.isArray(local)&&Array.isArray(remote)&&Array.isArray(base)) {
      if(["emergencyRecoveryLog"].includes(last)&&equal(local.slice(0,base.length),base)&&equal(remote.slice(0,base.length),base)) {
        const extra=local.slice(base.length).filter(v=>!remote.slice(base.length).some(w=>equal(v,w)));
        return {data:copy([...remote,...extra]),conflicts:[]};
      }
      if(["players","courses"].includes(last)&&[base,local,remote].every(a=>a.every(v=>object(v)&&v.id!==undefined)&&new Set(a.map(v=>String(v.id))).size===a.length)) {
        const toMap=a=>Object.fromEntries(a.map(v=>[String(v.id),v]));
        const result=merge(toMap(base),toMap(local),toMap(remote),path);
        return {data:Object.values(result.data),conflicts:result.conflicts};
      }
      if(last==="groups"&&local.length===base.length&&remote.length===base.length) {
        const data=[],conflicts=[];
        for(let i=0;i<base.length;i++){const result=merge(base[i],local[i],remote[i],[...path,String(i)]);data.push(result.data);conflicts.push(...result.conflicts);}
        return {data,conflicts};
      }
    }
    if(object(local)&&object(remote)&&(object(base)||base==null)) {
      const data={},conflicts=[];
      for(const key of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])) {
        if(["__proto__","constructor","prototype"].includes(key))throw Error("Invalid saved field");
        const result=merge(base?.[key],local[key],remote[key],[...path,key]);
        if(result.data!==undefined)data[key]=result.data;
        conflicts.push(...result.conflicts);
      }
      return {data,conflicts};
    }
    return {data:copy(local),conflicts:[{path,base:copy(base),local:copy(local),remote:copy(remote)}]};
  }
  const key="golfSafeSaves.v1", retentionMs=30*24*60*60*1000;
  let activeEvent="",cloudStatus="",state={},unreadable=false;
  const storageFailures=new Map();
  let measuredAt=0,measuredBytes=0;
  function showHealth(){
    if(typeof document==="undefined")return;
    let node=document.getElementById("golfSaveHealth");
    if(!node){node=document.createElement("div");node.id="golfSaveHealth";node.setAttribute("role","status");node.setAttribute("aria-live","polite");node.style.cssText="padding:8px 14px;background:#edf4fa;color:#17324d;font-size:14px;font-weight:600;overflow-wrap:anywhere";const header=document.querySelector("header");if(header)header.after(node);else document.body?.prepend(node);}
    const counts=saveHealth(activeEvent),messages=[];
    if(storageFailures.size)messages.push(...new Set(storageFailures.values()));
    if(Date.now()-measuredAt>5000){measuredAt=Date.now();measuredBytes=0;try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);measuredBytes+=2*(k.length+(localStorage.getItem(k)||"").length);}}catch{}}
    if(measuredBytes>=4*1024*1024)messages.push("App’s local storage is getting full — Review unwanted data.");
    if(counts.conflicts)messages.push(`${counts.conflicts} saved ${counts.conflicts===1?"copy needs":"copies need"} organiser review.`);
    if(counts.blocked)messages.push("Accepted-card changes retained on this device for organiser review.");
    if(counts.pending)messages.push(`${counts.pending} ${counts.pending===1?"card or plan is":"cards or plans are"} waiting to upload.`);
    if(cloudStatus)messages.push(cloudStatus);
    node.textContent=messages.join(" ");node.hidden=!messages.length;
    // App Storage already has a permanent button on the home page. Keep this
    // strip as a concise warning instead of presenting the same action twice.
  }
  function pruneRecords(records,active,now=Date.now()){
    let removed=0;
    for(const [k,s] of Object.entries(records))if(!active(k)&&Number.isFinite(s.savedAt)&&now-s.savedAt>retentionMs&&!s.pending&&!s.conflict&&!s.conflictId&&!s.blocked&&!s.virgin&&!s.reviewedFrom){delete records[k];removed++;}
    return removed;
  }
  function prune(){return pruneRecords(state,k=>k.startsWith(activeEvent+":"));}
  function storageRecords(){
    return Object.entries(state).map(([record,s])=>{const [eventId,kind,day,playerId]=record.split(":");
      const reason=eventId===activeEvent?"Current event":s.pending?"Waiting to upload":s.conflict||s.conflictId?"Needs organiser review":s.blocked?"Correction needs review":!s.acknowledged||s.virgin||s.reviewedFrom?"Recovery copy protected":!s.savedAt?"Save not verified":"Saved online";
      return {record,eventId,kind,day:+day||null,playerId,name:s.pending?.event?.name||s.base?.event?.name||eventId,bytes:2*(record.length+JSON.stringify(s).length),pending:!!s.pending,status:s.conflict||s.conflictId?"Needs organiser review":s.blocked?"Correction needs review":s.pending?"Waiting to upload":reason,removable:reason==="Saved online"};
    });
  }
  function removeStorageRecord(record){
    const row=storageRecords().find(r=>r.record===record);
    if(!row?.removable)throw Error("This copy is protected. Upload or review it first.");
    if(unreadable||!equal(JSON.parse(localStorage.getItem(key)||"{}"),state))throw Error("Saved copies changed in another window. Reopen the app before cleaning up.");
    const previous=state[record];delete state[record];
    try{persist();}catch(error){state[record]=previous;throw error;}
    measuredAt=0;showHealth();
  }
  function discardTestEvent(eventId){
    if(!eventId)throw Error("The test event could not be identified.");
    if(unreadable||!equal(JSON.parse(localStorage.getItem(key)||"{}"),state))throw Error("Saved copies changed in another window. Reopen the app before cleaning up.");
    const prefix=String(eventId)+":";
    const removed=Object.keys(state).filter(record=>record.startsWith(prefix));
    if(!removed.length)return 0;
    const previous=copy(state);
    for(const record of removed)delete state[record];
    try{persist();}catch(error){state=previous;throw error;}
    measuredAt=0;showHealth();return removed.length;
  }
  function discardAbandonedRecord(record,allowActiveTest=false){
    const row=storageRecords().find(item=>item.record===record);
    if(!row?.pending||(row.eventId===activeEvent&&!allowActiveTest))throw Error("Only an unsent copy from an event that is no longer open, or an explicitly confirmed TEST event, can be discarded here.");
    if(unreadable||!equal(JSON.parse(localStorage.getItem(key)||"{}"),state))throw Error("Saved copies changed in another window. Reopen the app before cleaning up.");
    const previous=state[record];delete state[record];
    try{persist();}catch(error){state[record]=previous;throw error;}
    measuredAt=0;showHealth();return true;
  }
  async function retryStorageRecord(record){
    const [id,kind,day,player]=record.split(":"),s=state[record];
    if(id!==activeEvent)throw Error("Open this event before retrying its upload.");
    if(!s?.pending||s.conflict||s.conflictId||s.blocked)throw Error("This copy needs organiser review rather than Retry Upload.");
    return save(id,kind,copy(s.pending),+day||null,player||null,{status:s.pending?.event?.locked?"locked":"preview"});
  }
  function storageWrite(k,value){
    try{localStorage.setItem(k,value);storageFailures.delete(k);showHealth();}
    catch(e){storageFailures.set(k,"Device save failed. Keep this app open and restore storage space or export a backup. Changes may be lost if you close it.");showHealth();throw e;}
  }
  try{state=JSON.parse(localStorage.getItem(key)||"{}");if(!object(state))throw Error("Invalid saved copies");}catch{unreadable=true;storageFailures.set(key,"Saved-copy recovery data could not be read. Keep the app open and export a backup before clearing app data.");state={};}
  const persist=()=>{if(unreadable){showHealth();throw Error("Saved-copy recovery data is unreadable; the original has been preserved.");}prune();storageWrite(key,JSON.stringify(state));};
  function saveHealth(id){
    const rows=Object.entries(state).filter(([k])=>id&&k.startsWith(id+":"));
    return {pending:rows.filter(([,s])=>s.pending&&!s.conflict&&!s.blocked).length,conflicts:rows.filter(([,s])=>s.conflict).length,blocked:rows.filter(([,s])=>s.blocked).length};
  }
  const error=(message,code)=>Object.assign(new Error(message),{code});
  let api,raw;
  function entry(id,kind,day,player){return [id,kind,day||"",player||""].join(":");}
  function safeData(kind,value){
    const data=copy(value);
    if(kind==="event"&&object(data?.event))delete data.event.finalUpdateCloudSentAt;
    return data;
  }
  function remember(k,data,revision,kind){if(!state[k]?.acknowledged){state[k]={...state[k],base:safeData(kind,data),revision,acknowledged:true,virgin:true};persist();}return state[k];}
  function ingest(id,bundle){
    remember(entry(id,"event"),bundle.event.event_data,bundle.event.revision,"event");
    for(const row of bundle.scores||[])remember(entry(id,"score",row.day,row.scorer_player_id),row.score_data,row.revision,"score");
    return bundle;
  }
  async function retain(id,kind,day,player,s,remote,result){
    s.conflict={event_id:id,kind,day,player_id:player,base:s.virgin?null:s.base,local:s.pending,remote:remote.data,revision:remote.revision,fields:result.conflicts};persist();
    try{const row=await raw.safeControl("retain",s.conflict);s.conflict.id=row.id;persist();}catch(e){s.conflictUploadError=String(e.message||e);persist();}
    throw error("Conflicting changes retained. The organiser must review the saved copies.","GOLF_CONFLICT");
  }
  async function save(id,kind,data,day,player,options={}) {
    activeEvent=id;
    const k=entry(id,kind,day,player);
    data=safeData(kind,data);
    // Save before any network operation. No acknowledged base moves on polling.
    const s=state[k] ||= {};s.pending=copy(data);persist();
    if(!s.acknowledged){const b=await raw.loadEvent(id);ingest(id,b);if(!state[k].acknowledged)remember(k,{},null,kind);}
    const current=state[k];
    if(current!==s)return save(id,kind,data,day,player,options);
    if(s.conflict)throw error("Saved copies need organiser review.","GOLF_CONFLICT");
    for(let attempt=0;attempt<3;attempt++) {
      const bundle=await raw.loadEvent(id);
      const row=kind==="event"?bundle.event:(bundle.scores||[]).find(x=>+x.day===+day&&String(x.scorer_player_id)===String(player));
      const remote={data:kind==="event"?row.event_data:row?.score_data||{},revision:row?.revision??null};
      const result=merge(s.virgin?undefined:s.base,s.pending,remote.data);
      if(result.conflicts.length)await retain(id,kind,day,player,s,remote,result);
      try{
        const response=kind==="event"?await raw.updateEvent(id,result.data,options.status,remote.revision):await raw.saveRound(id,day,player,result.data,{...options,expectedRevision:remote.revision});
        let acknowledged=result.data,ackRevision=response.revision;
        if(kind==="event"){const fresh=await raw.loadEvent(id);acknowledged=fresh.event.event_data;ackRevision=fresh.event.revision;}
        s.base=copy(acknowledged);s.revision=ackRevision;s.savedAt=Date.now();delete s.virgin;delete s.pending;persist();
        return {...response,revision:ackRevision,saved_data:copy(acknowledged)};
      }catch(e){if(e.code!=="40001"){if(/GOLF_CLOSED/.test(e.message||"")){s.blocked=true;persist();}throw e;}}
    }
    throw error("Other devices are still saving. Your changes remain on this device. Retry shortly.","GOLF_BUSY");
  }
  function reconcile(id,kind,local,remote,revision,day,player){
    local=safeData(kind,local);remote=safeData(kind,remote);
    const k=entry(id,kind,day,player),s=remember(k,remote,revision,kind);
    s.base=safeData(kind,s.base);
    if(s.pending!==undefined)s.pending=safeData(kind,s.pending);
    if(s.reviewedFrom){local=merge(s.reviewedFrom,local,s.base).data;delete s.reviewedFrom;}
    if(s.conflict)return copy(local);
    const result=merge(s.virgin?undefined:s.base,s.pending?merge(s.base,local,s.pending).data:local,remote);
    if(result.conflicts.length){s.pending=copy(local);s.conflict={event_id:id,kind,day,player_id:player,base:s.virgin?null:s.base,local,remote,revision,fields:result.conflicts};persist();
      raw.safeControl("retain",s.conflict).then(row=>{s.conflict.id=row.id;persist();}).catch(()=>{});
      return copy(local);
    }
    s.base=copy(remote);s.revision=revision;delete s.virgin;
    if(equal(result.data,remote))delete s.pending;else s.pending=copy(result.data);
    persist();return result.data;
  }
  function install(adapter){
    raw={...adapter};api=adapter;
    adapter.loadEvent=async id=>{
      activeEvent=id;
      const bundle=await raw.loadEvent(id);
      for(const [k,s] of Object.entries(state))if(s.conflict?.event_id===id&&s.conflict.id){
        try{const reviewed=await raw.safeControl("status",{event_id:id,id:s.conflict.id});
          if(reviewed?.resolved){const pending=s.pending?merge(s.conflict.local,s.pending,reviewed.data).data:reviewed.data;state[k]={base:copy(reviewed.data),revision:reviewed.revision,acknowledged:true,pending,reviewedFrom:copy(s.conflict.local)};persist();}
        }catch{}
      }
      return ingest(id,bundle);
    };
    adapter.createEvent=async(...args)=>{const row=await raw.createEvent(...args);const id=row.event_id||row.id;const bundle=await raw.loadEvent(id);ingest(id,bundle);return row;};
    adapter.updateEvent=(id,data,status)=>status==="archived"?raw.updateEvent(id,data,status):save(id,"event",data,null,null,{status});
    adapter.saveRound=(id,day,player,data,options)=>save(id,"score",data,day,player,options);
    adapter.reconcile=reconcile;
    adapter.safeConflicts=async id=>{
      for(const s of Object.values(state))if(s.conflict?.event_id===id&&!s.conflict.id){try{const row=await raw.safeControl("retain",s.conflict);s.conflict.id=row.id;persist();}catch{}}
      return raw.safeControl("list",{event_id:id});
    };
    adapter.resolveSafeConflict=async(id,choices)=>{
      const response=await raw.safeControl("resolve",{id,choices});
      const k=entry(response.event_id,response.kind,response.day,response.player_id);
      state[k]={base:copy(response.data),revision:response.revision,acknowledged:true,savedAt:Date.now()};persist();return response;
    };
    adapter.pendingRounds=id=>Object.entries(state).filter(([k,s])=>k.startsWith(id+":score:")&&s.pending&&!s.conflict&&!s.blocked).map(([k])=>{const parts=k.split(":");return {day:+parts[2],playerId:parts[3]};});
    adapter.stageRound=(id,day,player,data)=>{activeEvent=id;const s=state[entry(id,"score",day,player)]||={};s.pending=copy(data);persist();};
    adapter.saveHealth=saveHealth;
    adapter.pendingSafeSaves=id=>Object.values(state).filter(s=>s.conflict?.event_id===id).length;
    adapter.safeReconcileAcknowledged=(id,kind,data,revision,day,player)=>{state[entry(id,kind,day,player)]={base:copy(data),revision,acknowledged:true,savedAt:Date.now()};persist();};
    return adapter;
  }
  window.GolfSafeCloud={storageRecords,removeStorageRecord,discardTestEvent,discardAbandonedRecord,retryStorageRecord,merge,equal,install,storageWrite,pruneRecords,saveHealth,reportStatus:(message,id)=>{activeEvent=id||"";cloudStatus=message;showHealth();}};
  if(typeof window.addEventListener==="function")window.addEventListener("DOMContentLoaded",showHealth);
})();
