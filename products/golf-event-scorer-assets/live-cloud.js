(() => {
 'use strict';
 const cfg=window.GES_ACCOUNT_CONFIG;
 const auth=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{storageKey:'golfEventScorerGroupAuth',persistSession:true,detectSessionInUrl:false,autoRefreshToken:true}});
 const revisions=new Map(),scores=new Map(),knownCodes=new Map();
 const token=id=>{try{return JSON.parse(localStorage.getItem('gesLiveConnections')||'{}')[id]||null;}catch{return null;}};
 const keepToken=(id,value)=>{let saved={};try{saved=JSON.parse(localStorage.getItem('gesLiveConnections')||'{}');}catch{}saved[id]=value;localStorage.setItem('gesLiveConnections',JSON.stringify(saved));};
 async function rpc(action,args={}){const {data,error}=await auth.rpc('ges_live',{p_action:action,p_args:args});if(error)throw error;return data;}
 async function loadEvent(id){const bundle=await rpc('load',{event_id:id,token:token(id)});revisions.set(id,bundle.event.revision);for(const s of bundle.scores||[])scores.set(`${id}:${s.day}:${s.scorer_player_id}`,s.revision);return bundle;}
 async function list(archived=false){return rpc('list',{group_id:window.GES_PLANNER_CONTEXT?.group.id,archived});}
 async function createEvent(name,payload,playerRows){const ctx=window.GES_PLANNER_CONTEXT;if(!ctx)throw new Error('Open your approved group planner to publish.');await ctx.save(payload.event);const row=await rpc('create',{draft_id:ctx.event.id,payload,player_rows:playerRows});revisions.set(row.event_id,row.revision);if(row.draft_revision)ctx.event.revision=row.draft_revision;return row;}
 async function updateEvent(id,payload,status){if(status==='archived')return rpc('archive',{event_id:id});if(!revisions.has(id))await loadEvent(id);const row=await rpc('update',{event_id:id,payload,expected_revision:revisions.get(id)});revisions.set(id,row.revision);if(window.GES_PLANNER_CONTEXT?.event&&row.draft_revision)window.GES_PLANNER_CONTEXT.event.revision=row.draft_revision;return row;}
 async function ownerAccount(){const {data}=await auth.auth.getUser();const user=data?.user;return {id:user?.id||'',email:user?.email||'',confirmed:!!user?.email_confirmed_at,permanent:!!user?.email_confirmed_at&&!user?.is_anonymous,anonymous:!user||!!user.is_anonymous,pending:false};}
 const unavailable=async()=>{throw new Error('Manage organiser access through Groups & Organiser Accounts.');};
 window.AwayCloud={
  client:{removeChannel:async channel=>channel?.unsubscribe?.()},
  ensureSignedIn:async()=>{const {data}=await auth.auth.getSession();return data.session||{user:{id:'',is_anonymous:true}};},ownerAccount,
  createEvent,updateEvent,loadEvent,
  syncEventPlayers:async(id)=>rpc('sync_players',{event_id:id}),
  invitation:async code=>{const rows=await rpc('invitation',{code});if(rows.length)knownCodes.set(code,rows[0].event_id);return rows;},
  joinEvent:async(code,playerId)=>{const id=knownCodes.get(code),r=await rpc('join',{code,player_id:playerId,token:id?token(id):null});keepToken(r.event_id,r.token);return r.event_id;},
  spectateEvent:async code=>{const id=knownCodes.get(code);if(id&&token(id))try{return await loadEvent(id);}catch{}const r=await rpc('spectate',{code});knownCodes.set(code,r.event_id);keepToken(r.event_id,r.token);return loadEvent(r.event_id);},
  saveRound:async(id,day,playerId,scoreData)=>{const key=`${id}:${day}:${playerId}`,r=await rpc('save_score',{event_id:id,day,player_id:playerId,score_data:scoreData,token:token(id),expected_revision:scores.get(key)??null});scores.set(key,r.revision);return r;},
  releasePlayer:async(id,playerId)=>rpc('release',{event_id:id,player_id:playerId}),
  subscribe:(id,onChange)=>{let latest='';const timer=setInterval(async()=>{if(document.hidden)return;try{const b=await loadEvent(id),stamp=JSON.stringify([b.event.revision,b.players.map(p=>p.joined_at),b.scores.map(s=>[s.day,s.scorer_player_id,s.revision]),b.spectatorCount]);if(stamp!==latest){latest=stamp;onChange();}}catch{}},5000);return {unsubscribe:async()=>clearInterval(timer)};},
  saveWorkspace:async()=>{},loadWorkspace:async()=>null,
  loadLatestOwnedEvent:async()=>(await list())[0]||null,loadRecentOwnedEvents:async limit=>(await list()).slice(0,limit||5),loadPastOwnedEvents:async limit=>(await list(true)).slice(0,limit||50),
  archiveEvent:async id=>rpc('archive',{event_id:id}),archiveAllOwnedEvents:async()=>{const out=[];for(const e of await list())out.push(await rpc('archive',{event_id:e.id}));return out;},
  protectOwnerAccount:unavailable,resendOwnerVerification:unavailable,sendOwnerSignInLink:unavailable,createOrganiserKey:unavailable,claimOrganiserAccess:unavailable,createGuestOrganiserKey:unavailable,claimGuestOrganiserAccess:unavailable,revokeGuestOrganiser:unavailable,guestOrganiserActive:async()=>false,
 };
})();
