(() => {
 'use strict';
 const isTest=name=>/^TEST(?:[^\p{L}\p{N}_]|$)/iu.test(String(name||'').trimStart());
 const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
 const keys=s=>Array.from({length:s.length},(_,i)=>s.key(i)).filter(Boolean);
 const read=(s,k)=>{try{return JSON.parse(s.getItem(k)||'null')}catch{return null}};
 function purge(target,storage=localStorage){
  if(!isTest(target.name))return {protected:true};
  const ids=new Set([...(target.ids||[]),target.liveId,target.workspaceId,target.publicationId].filter(Boolean).map(String));
  if(!ids.size)return {protected:true};
  for(const key of keys(storage).filter(k=>/^awayGolf/.test(k))){
   const saved=read(storage,key);for(const row of [...(saved?.eventWorkspace||[]),{event:saved?.event,cloud:saved?.cloud}]){
    if([row.cloud?.eventId,row.event?.cloudEventId,row.event?.pastCloudEventId,row.event?.workspaceId,row.event?.id].some(id=>ids.has(String(id||''))))for(const id of [row.event?.workspaceId,row.event?.id,row.event?.publicationId,row.cloud?.eventId])if(id)ids.add(String(id));
   }
  }
  function prune(value,root=false){
   if(Array.isArray(value))return value.map(x=>prune(x)).filter(x=>x!==undefined);
   if(!object(value))return value;
   if(!root&&['id','workspaceId','publicationId','eventId','event_id','cloudEventId','pastCloudEventId','eventReference'].some(k=>ids.has(String(value[k]||''))))return undefined;
   if(!root&&!value.players&&!value.courses&&!value.eventWorkspace&&(ids.has(String(value.cloud?.eventId||''))||['id','workspaceId','publicationId','cloudEventId','pastCloudEventId'].some(k=>ids.has(String(value.event?.[k]||'')))))return undefined;
   const out={};for(const [key,item]of Object.entries(value)){
    if(ids.has(key)||[...ids].some(id=>key.startsWith(id+':')))continue;
    const next=prune(item);if(next!==undefined)out[key]=next;
   }return out;
  }
  // Clear the adapter's in-memory recovery copies before touching storage.
  for(const id of ids)window.GolfSafeCloud?.discardEventCopies(id);
  for(const key of keys(storage)){
   if(!/^(awayGolf|golfSafeSaves)/.test(key)||/Auth|ActiveWriter/i.test(key))continue;
   const saved=read(storage,key);if(!saved||typeof saved!=='object')continue;
   if(!saved.players&&!saved.courses&&['eventId','event_id','eventReference'].some(k=>ids.has(String(saved[k]||'')))){storage.removeItem(key);continue;}
   const next=prune(saved,true);
   if(next.activeEventId&&ids.has(String(next.activeEventId)))next.activeEventId=null;
   if(saved.event&&!next.event){next.event=null;next.activeEventId=null;delete next.cloud;next.cloudPlayers=[];}
   storage.setItem(key,JSON.stringify(next));
  }
  storage.setItem('awayGolfActiveWriterV1','retired-test-'+Date.now());
  return {protected:false,ids:[...ids]};
 }
 function purgeMissing(liveId,storage=localStorage){
  for(const key of keys(storage).filter(k=>/^awayGolf/.test(k))){
   const saved=read(storage,key);for(const row of [...(saved?.eventWorkspace||[]),{event:saved?.event,cloud:saved?.cloud}]){
    if([row.cloud?.eventId,row.event?.cloudEventId,row.event?.pastCloudEventId,row.event?.awardedResults?.eventId].some(id=>String(id||'')===String(liveId))&&isTest(row.event?.name))return purge({name:row.event.name,liveId,workspaceId:row.event.workspaceId||row.event.id,publicationId:row.event.publicationId},storage);
   }
  }
  for(const [key,saved]of Object.entries(read(storage,'golfSafeSaves.v1')||{}))if(key.startsWith(liveId+':')){const name=saved.pending?.event?.name||saved.base?.event?.name;if(isTest(name))return purge({name,liveId},storage);}
  return {protected:true};
 }
 window.AwayTestPurge={isTest,purge,purgeMissing};
})();
