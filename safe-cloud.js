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
  const key="golfSafeSaves.v1";
  let state={};try{state=JSON.parse(localStorage.getItem(key)||"{}");}catch{}
  const persist=()=>localStorage.setItem(key,JSON.stringify(state));
  const error=(message,code)=>Object.assign(new Error(message),{code});
  let api,raw;
  function entry(id,kind,day,player){return [id,kind,day||"",player||""].join(":");}
  function remember(k,data,revision){if(!state[k]?.acknowledged){state[k]={...state[k],base:copy(data),revision,acknowledged:true,virgin:true};persist();}return state[k];}
  function ingest(id,bundle){
    remember(entry(id,"event"),bundle.event.event_data,bundle.event.revision);
    for(const row of bundle.scores||[])remember(entry(id,"score",row.day,row.scorer_player_id),row.score_data,row.revision);
    return bundle;
  }
  async function retain(id,kind,day,player,s,remote,result){
    s.conflict={event_id:id,kind,day,player_id:player,base:s.virgin?null:s.base,local:s.pending,remote:remote.data,revision:remote.revision,fields:result.conflicts};persist();
    try{const row=await raw.safeControl("retain",s.conflict);s.conflict.id=row.id;persist();}catch(e){s.conflictUploadError=String(e.message||e);persist();}
    throw error("Conflicting changes retained. The organiser must review the saved copies.","GOLF_CONFLICT");
  }
  async function save(id,kind,data,day,player,options={}) {
    const k=entry(id,kind,day,player);
    // Save before any network operation. No acknowledged base moves on polling.
    const s=state[k] ||= {};s.pending=copy(data);persist();
    if(!s.acknowledged){const b=await raw.loadEvent(id);ingest(id,b);if(!state[k].acknowledged)remember(k,{},null);}
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
        s.base=copy(acknowledged);s.revision=ackRevision;delete s.virgin;delete s.pending;persist();
        return {...response,revision:ackRevision,saved_data:copy(acknowledged)};
      }catch(e){if(e.code!=="40001"){if(/GOLF_CLOSED/.test(e.message||"")){s.blocked=true;persist();}throw e;}}
    }
    throw error("Other devices are still saving. Your changes remain on this device. Retry shortly.","GOLF_BUSY");
  }
  function reconcile(id,kind,local,remote,revision,day,player){
    const k=entry(id,kind,day,player),s=remember(k,remote,revision);
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
      state[k]={base:copy(response.data),revision:response.revision,acknowledged:true};persist();return response;
    };
    adapter.pendingRounds=id=>Object.entries(state).filter(([k,s])=>k.startsWith(id+":score:")&&s.pending&&!s.conflict&&!s.blocked).map(([k])=>{const parts=k.split(":");return {day:+parts[2],playerId:parts[3]};});
    adapter.pendingSafeSaves=id=>Object.values(state).filter(s=>s.conflict?.event_id===id).length;
    adapter.safeReconcileAcknowledged=(id,kind,data,revision,day,player)=>{state[entry(id,kind,day,player)]={base:copy(data),revision,acknowledged:true};persist();};
    return adapter;
  }
  window.GolfSafeCloud={merge,equal,install};
})();
