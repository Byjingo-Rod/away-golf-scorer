// The one authoritative course catalogue lives in Away Golf's database.
// Away Golf and Golf Event Scorer users are verified against their own Auth
// project, then all catalogue operations are performed here server-side.
const AWAY_URL='https://qlxcpsbyfhgatujrqxkd.supabase.co';
const AWAY_KEY='sb_publishable_fzOrPzsGh48ABTEoob5O0Q_gpdZTEmI';
const GES_URL='https://rlkyibpyezzoadowcdre.supabase.co';
const GES_KEY='sb_publishable_s91bTb92dV2hvM6O9VCWqQ_YauSeQWY';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});

async function userAt(url:string,key:string,authorization:string,send:typeof fetch){
  const response=await send(url+'/auth/v1/user',{headers:{apikey:key,Authorization:authorization},signal:AbortSignal.timeout(10000)});
  if(!response.ok)return null;
  const user=await response.json();return user?.id?user:null;
}
async function rpcAt(url:string,key:string,authorization:string,name:string,body:unknown,send:typeof fetch){
  const response=await send(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(!response.ok)return null;return response.json();
}
export async function handle(req:Request,env=(name:string)=>Deno.env.get(name),send:typeof fetch=fetch){
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return reply({error:'POST required'},405);
  try{
    const authorization=req.headers.get('Authorization')||'';
    if(!/^Bearer [A-Za-z0-9._-]+$/.test(authorization))return reply({error:'Sign in first',code:'42501'},401);
    let source:'away'|'ges'='away',user=await userAt(AWAY_URL,AWAY_KEY,authorization,send),owner=false,editor=false;
    if(user){
      const permission=await rpcAt(AWAY_URL,AWAY_KEY,authorization,'away_course_master_identity',{},send);
      owner=permission?.owner===true;editor=permission?.editor===true;
    }else{
      source='ges';user=await userAt(GES_URL,GES_KEY,authorization,send);
      if(!user)return reply({error:'Your sign-in has expired',code:'42501'},401);
      owner=(await rpcAt(GES_URL,GES_KEY,authorization,'ges_is_owner',{},send))===true;
      editor=!!user.email_confirmed_at&&!user.is_anonymous;
    }
    if(!editor)return reply({error:'Approved course access is required',code:'42501'},403);
    const raw=await req.text();if(raw.length>300000)return reply({error:'Course request is too large'},413);
    const body=JSON.parse(raw);if(!['load','get','save','history','reviews','resolve','location'].includes(body.action))return reply({error:'Unknown course action'},400);
    const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)throw Error('Course service is not configured');
    const result=await send(url+'/rest/v1/rpc/away_master_gateway',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_action:body.action,p_args:body.args||{},p_actor:user.id,p_owner:owner,p_source:source}),signal:AbortSignal.timeout(15000)});
    const data=await result.json();if(!result.ok)return reply({error:data.message||'Course action did not complete',code:data.code},result.status);
    return reply({data,source,owner});
  }catch(e){return reply({error:e instanceof Error?e.message:'Course service unavailable'},503);}
}
if(import.meta.main)Deno.serve(req=>handle(req));
