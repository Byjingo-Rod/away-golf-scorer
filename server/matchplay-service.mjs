// Server-only authority boundary. Never accept identity or a replacement draw from a client.
import * as M from '../matchplay-model.mjs';
import S from '../matchplay-session.js';
const clone=x=>structuredClone(x);
export class MatchplayError extends Error {
 constructor(code,message,status=400){super(message);this.code=code;this.status=status;}
}
function fail(code,message,status=400){throw new MatchplayError(code,message,status);}
const fields=['operation','key','hole','kind','value','by','requestId','expectedRevision'];
export function publicSnapshot(record){
 const state=clone(record.state);
 state.players=state.players.map(p=>Object.fromEntries(['id','name','gender','sex','playingHcp','seed','status'].filter(k=>k in p).map(k=>[k,p[k]])));
 state.audit=[];
 return {revision:record.revision,state};
}
function fingerprint(c){return JSON.stringify(fields.filter(k=>k!=='expectedRevision'&&k!=='requestId').map(k=>[k,c[k]??null]));}
// store.read and compareAndSwap must be backed by a single atomic conditional write.
// membership is resolved by the authenticated server adapter on every request.
export function createMatchplayService({store,membership}){
 async function authorised(principal,resource){
  if(!principal?.userId)fail('unauthenticated','Sign in before joining the event.',401);
  if(!resource?.eventId||!resource?.gradeId)fail('invalid_resource','Select an event and grade.');
  const access=await membership(principal.userId,resource);
  if(!access||!['player','spectator','organiser'].includes(access.role))fail('forbidden','You do not have access to this event.',403);
  return access;
 }
 return {
  async read(principal,resource){await authorised(principal,resource);const record=await store.read(resource);if(!record)fail('not_found','This grade is unavailable.',404);return publicSnapshot(record);},
  async command(principal,resource,c){
   const access=await authorised(principal,resource);
   if(access.role!=='player'||!access.playerId)fail('read_only','This view cannot enter player scores.',403);
   if(!c||Object.keys(c).some(k=>!fields.includes(k)))fail('invalid_command','Unsupported scoring request.');
   if(!/^[a-zA-Z0-9_-]{16,80}$/.test(c.requestId||''))fail('invalid_request','A unique request identifier is required.');
   const record=await store.read(resource);if(!record)fail('not_found','This grade is unavailable.',404);
   const receipt=record.receipts?.find(r=>r.id===c.requestId);
   if(receipt){if(receipt.userId!==principal.userId||receipt.fingerprint!==fingerprint(c))fail('request_reuse','This request identifier was already used.',409);return {...publicSnapshot(record),replayed:true};}
   if(!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision!==record.revision)fail('revision_conflict','New scores arrived. Review the latest match before sending this entry again.',409);
   const state=clone(record.state),id=access.playerId,journey=M.playerJourney(state,id);
   if(journey.key!==c.key||!state.matches[c.key]||!M.opponents(state,c.key).includes(id))fail('wrong_match','You can only update your current match.',403);
   if(['eliminated','waiting','champion'].includes(journey.status))fail('round_closed','Your scoring access for this round is closed.',403);
   const side=M.opponents(state,c.key).indexOf(id)===0?'a':'b';
   if(['score','concede_hole','confirm_concession'].includes(c.operation)&&(!Number.isInteger(c.hole)||c.hole<1||c.hole>1000))fail('invalid_hole','Choose a valid match hole.');
   if(c.operation!=='acknowledge'&&!state.matches[c.key].acknowledgements?.[id])fail('not_acknowledged','Read the event details and press Got it first.');
   if(c.operation==='concede_match'&&!journey.canScore)fail('round_closed','This match is already decided.');
   try{
    if(c.operation==='acknowledge')S.acknowledge(M,state,id,c.key,()=>true);
    else if(c.operation==='score'){
     if(!['own','marked'].includes(c.kind)||!Number.isInteger(c.value)||c.value<1||c.value>30)fail('invalid_score','Enter a whole number from 1 to 30.');
     const row=state.matches[c.key].holes[c.hole]||{};
     const own=side==='a'?row.selfA:row.selfB,marked=side==='a'?row.markerB:row.markerA;
     S.enter(M,state,id,c.key,c.hole,c.kind==='own'?c.value:own,c.kind==='marked'?c.value:marked,()=>true);
    }else if(c.operation==='concede_hole')S.requestConcession(M,state,id,c.key,c.hole,c.by,()=>true);
    else if(c.operation==='confirm_concession')S.confirmConcession(M,state,id,c.key,c.hole,()=>true);
    else if(c.operation==='concede_match')M.concede(state,c.key,side,true);
    else if(c.operation==='confirm_result')S.confirm(M,state,id,c.key,()=>true);
    else fail('invalid_operation','This scoring action is unavailable.');
   }catch(error){if(error instanceof MatchplayError)throw error;fail('invalid_state',error.message);}
   const next={...record,state,revision:record.revision+1,receipts:[...(record.receipts||[]),{id:c.requestId,userId:principal.userId,fingerprint:fingerprint(c)}]};
   // Receipts live for the event lifetime. An old acknowledged request must never be reapplied.
   if(!await store.compareAndSwap(resource,record.revision,next))fail('revision_conflict','The other phone saved first. Refresh and review this entry.',409);
   return publicSnapshot(next);
  }
 };
}
