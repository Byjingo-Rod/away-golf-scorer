(()=>{
'use strict';

const SUPABASE_URL='https://qlxcpsbyfhgatujrqxkd.supabase.co';
const SUPABASE_KEY='sb_publishable_fzOrPzsGh48ABTEoob5O0Q_gpdZTEmI';
const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
});
let initPromise=null;

async function ensureSignedIn(){
  if(initPromise)return initPromise;
  initPromise=(async()=>{
    const current=await client.auth.getSession();
    if(current.error)throw current.error;
    if(current.data.session)return current.data.session;
    const signed=await client.auth.signInAnonymously();
    if(signed.error)throw signed.error;
    return signed.data.session;
  })().catch(error=>{initPromise=null;throw error});
  return initPromise;
}

async function createEvent(name,eventData,players){
  await ensureSignedIn();
  const {data,error}=await client.rpc('create_away_event',{
    p_name:name,p_event_data:eventData,p_players:players
  });
  if(error)throw error;
  return Array.isArray(data)?data[0]:data;
}

async function updateEvent(eventId,eventData,status){
  await ensureSignedIn();
  const {data,error}=await client.from('away_events')
    .update({event_data:eventData,status})
    .eq('id',eventId).select('id,join_code,revision,updated_at').single();
  if(error)throw error;
  return data;
}

async function invitation(code){
  await ensureSignedIn();
  const {data,error}=await client.rpc('away_event_invitation',{p_join_code:String(code||'').trim().toUpperCase()});
  if(error)throw error;
  return data||[];
}

async function joinEvent(code,playerId){
  await ensureSignedIn();
  const {data,error}=await client.rpc('join_away_event',{
    p_join_code:String(code||'').trim().toUpperCase(),p_player_id:String(playerId)
  });
  if(error)throw error;
  return data;
}

async function loadEvent(eventId){
  await ensureSignedIn();
  const [eventResult,playersResult,scoresResult]=await Promise.all([
    client.from('away_events').select('id,join_code,name,status,event_data,revision,updated_at').eq('id',eventId).single(),
    client.from('away_event_players').select('player_id,display_name,player_data,member_user_id,joined_at').eq('event_id',eventId),
    client.from('away_round_scores').select('day,scorer_player_id,score_data,revision,updated_at').eq('event_id',eventId)
  ]);
  if(eventResult.error)throw eventResult.error;
  if(playersResult.error)throw playersResult.error;
  if(scoresResult.error)throw scoresResult.error;
  return{event:eventResult.data,players:playersResult.data||[],scores:scoresResult.data||[]};
}

async function saveRound(eventId,day,playerId,scoreData){
  await ensureSignedIn();
  const {data,error}=await client.from('away_round_scores').upsert({
    event_id:eventId,day:+day,scorer_player_id:String(playerId),score_data:scoreData
  },{onConflict:'event_id,day,scorer_player_id'}).select('revision,updated_at').single();
  if(error)throw error;
  return data;
}

async function releasePlayer(eventId,playerId){
  await ensureSignedIn();
  const {data,error}=await client.from('away_event_players')
    .update({member_user_id:null,joined_at:null})
    .eq('event_id',eventId).eq('player_id',String(playerId))
    .select('player_id,display_name,joined_at').single();
  if(error)throw error;
  return data;
}

async function saveWorkspace(workspaceData){
  const session=await ensureSignedIn();
  const {data,error}=await client.from('away_organiser_workspaces').upsert({
    owner_id:session.user.id,workspace_data:workspaceData
  },{onConflict:'owner_id'}).select('revision,updated_at').single();
  if(error)throw error;
  return data;
}

function subscribe(eventId,onChange){
  return client.channel('away-event-'+eventId)
    .on('postgres_changes',{event:'*',schema:'public',table:'away_events',filter:`id=eq.${eventId}`},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'away_event_players',filter:`event_id=eq.${eventId}`},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'away_round_scores',filter:`event_id=eq.${eventId}`},onChange)
    .subscribe();
}

window.AwayCloud={client,ensureSignedIn,createEvent,updateEvent,invitation,joinEvent,loadEvent,saveRound,releasePlayer,saveWorkspace,subscribe};
})();
