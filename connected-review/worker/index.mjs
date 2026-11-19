import * as M from '../../matchplay-model.mjs';
import {createMatchplayService,MatchplayError} from '../../server/matchplay-service.mjs';
import {COURSE} from '../course.mjs';
import {ASSETS} from '../generated-assets.mjs';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const hash=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)))).map(n=>n.toString(16).padStart(2,'0')).join('');

export default {async fetch(req,env){
 const url=new URL(req.url);
 if(!url.pathname.startsWith('/api/matchplay-review')){let p=url.pathname==='/'?'/index.html':url.pathname;let asset=ASSETS[p]||ASSETS[p+'.html'];if(!asset)return new Response('Not found',{status:404});return new Response(Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)),{headers:{'Content-Type':asset.type,'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'self' https://chatgpt.com"}});}
 try{
  const owner=req.headers.get('oai-authenticated-user-id');
  if(!owner)return json({error:'Open this private review while signed in to ChatGPT.',code:'unauthenticated'},401);
  if(req.method!=='POST')return json({error:'POST required'},405);
  if(req.headers.get('Origin')!==url.origin)return json({error:'This origin is unavailable.'},403);
  if(Number(req.headers.get('Content-Length'))>32768)return json({error:'Request too large'},413);
  const raw=await req.text();if(raw.length>32768)return json({error:'Request too large'},413);
  const body=JSON.parse(raw);
  const db=env.DB;
  if(body.action==='join'){
   const code=String(body.code||'').trim().toUpperCase();if(!/^[A-Z0-9]{4,12}$/.test(code))return json({error:'Use a test code of 4 to 12 letters or numbers.'},400);const key='connected-'+code;
   const allowed=['alex','parker','spectator'];if(!allowed.includes(body.role))return json({error:'Choose a review view.'},400);
   let row=await db.prepare('SELECT record FROM matchplay_reviews WHERE owner=? AND id=?').bind(owner,key).first();
   if(!row){const state=M.sampleDivision(18);state.config.format='handicapped';state.config.finalMode='players';state.config.division='Men’s Club Championship';state.config.tee='Back Markers';state.players.forEach((p,i)=>{p.playingHcp=i===0?-2:2;p.gender='male';});M.freezeQualifyingHandicaps(state);state.config.roundSettings=Array.from({length:4},()=>({...COURSE,courseName:'Oatlands GC',teeLabel:'Back Markers'}));state.published=true;const record={revision:0,state,receipts:[]};await db.prepare('INSERT OR IGNORE INTO matchplay_reviews(owner,id,revision,record) VALUES(?,?,?,?)').bind(owner,key,0,JSON.stringify(record)).run();row=await db.prepare('SELECT record FROM matchplay_reviews WHERE owner=? AND id=?').bind(owner,key).first();}
   const state=JSON.parse(row.record).state,ids=M.opponents(state,'r0m0'),token=crypto.randomUUID()+crypto.randomUUID(),tokenHash=await hash(token),playerId=body.role==='alex'?ids[0]:body.role==='parker'?ids[1]:null;
   await db.prepare('DELETE FROM matchplay_review_sessions WHERE owner=? AND expires<?').bind(owner,Date.now()).run();
   await db.prepare('INSERT INTO matchplay_review_sessions(token_hash,owner,event,role,player_id,expires) VALUES(?,?,?,?,?,?)').bind(tokenHash,owner,key,playerId?'player':'spectator',playerId,Date.now()+7*86400000).run();
   return json({token,playerId,eventId:key,gradeId:'men-1',role:playerId?'player':'spectator',roleName:body.role==='alex'?'Alex Andrews':body.role==='parker'?'Parker Price':'Spectator'});
  }
  const bearer=req.headers.get('Authorization')||'',token=bearer.startsWith('Bearer ')?bearer.slice(7):'';
  const session=token?await db.prepare('SELECT * FROM matchplay_review_sessions WHERE token_hash=? AND owner=? AND expires>?').bind(await hash(token),owner,Date.now()).first():null;
  if(!session)return json({error:'Choose your review view again.',code:'unauthenticated'},401);
  const resource={eventId:session.event,gradeId:'men-1'},store={
   async read(){const row=await db.prepare('SELECT record FROM matchplay_reviews WHERE owner=? AND id=?').bind(owner,session.event).first();return row?JSON.parse(row.record):null;},
   async compareAndSwap(r,revision,next){const result=await db.prepare('UPDATE matchplay_reviews SET revision=?,record=? WHERE owner=? AND id=? AND revision=?').bind(next.revision,JSON.stringify(next),owner,session.event,revision).run();return result.meta.changes===1;}
  };
  const service=createMatchplayService({store,membership:async()=>({role:session.role,playerId:session.player_id})}),principal={userId:owner+':'+session.token_hash};
  if(body.action==='read')return json(await service.read(principal,resource));
  if(body.action==='command')return json(await service.command(principal,resource,body.command));
  return json({error:'Unsupported request'},400);
 }catch(error){return json({code:error instanceof MatchplayError?error.code:'server_error',error:error instanceof MatchplayError?error.message:'The review service is unavailable. Please try again.'},error instanceof MatchplayError?error.status:503);}
}};
