import {MatchplayError} from './matchplay-service.mjs';
// authenticate must verify the bearer token with Away Auth. No identity comes from JSON.
export function createMatchplayHandler({service,authenticate,allowedOrigin}){
 return async req=>{
  const origin=req.headers.get('Origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(origin&&origin!==allowedOrigin)return reply({code:'origin_denied',error:'This origin is unavailable.'},403);
  if(origin){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization,content-type';headers['Access-Control-Allow-Methods']='POST,OPTIONS';}
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply({error:'POST required'},405);
  try{
   const principal=await authenticate(req.headers.get('Authorization')||'');
   if(!principal?.userId)throw new MatchplayError('unauthenticated','Sign in before joining the event.',401);
   if(Number(req.headers.get('Content-Length'))>32768)throw new MatchplayError('too_large','Scoring request is too large.',413);
   const text=await req.text();if(text.length>32768)throw new MatchplayError('too_large','Scoring request is too large.',413);
   let body;try{body=JSON.parse(text);}catch{throw new MatchplayError('invalid_json','Invalid scoring request.');}
   if(!body||typeof body!=='object'||Object.keys(body).some(k=>!['action','eventId','gradeId','command'].includes(k)))throw new MatchplayError('invalid_request','Unsupported request.');
   const resource={eventId:body.eventId,gradeId:body.gradeId};
   if(body.action==='read')return reply(await service.read(principal,resource));
   if(body.action==='command')return reply(await service.command(principal,resource,body.command));
   throw new MatchplayError('invalid_action','Unsupported request.');
  }catch(error){return reply({code:error instanceof MatchplayError?error.code:'server_error',error:error instanceof MatchplayError?error.message:'The scoring service is unavailable. Try again.'},error instanceof MatchplayError?error.status:503);}
 };
}
