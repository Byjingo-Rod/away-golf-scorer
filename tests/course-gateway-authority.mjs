import assert from 'node:assert/strict';
import {handle} from '../supabase/functions/course-master/index.ts';
async function request({action='load',id='c1',owner=false,editor=true,source='ges',email=true,anonymous=false,token=true}={}){
 let serviceCalls=0,body;
 const send=async(url,options={})=>{
   if(url.endsWith('/auth/v1/user')){
     const matches=source==='away'?url.includes('qlxcpsbyfhgatujrqxkd'):url.includes('rlkyibpyezzoadowcdre');
     return matches?Response.json({id:'synthetic',email_confirmed_at:email?'today':null,is_anonymous:anonymous}):Response.json({}, {status:401});
   }
   if(url.endsWith('/rpc/ges_course_master_identity')||url.endsWith('/rpc/away_course_master_identity'))return Response.json({owner,editor,courseIds:['away-c1']});
   if(url.endsWith('/rpc/away_master_gateway')){
     serviceCalls++;body=JSON.parse(options.body);
     return Response.json(action==='load'?{courses:[{id:'c1'},{id:'c2'}],proposals:[{course_id:'c1'},{course_id:'c2'}]}:{pending_approval:!body.p_owner});
   }
   throw Error('Unexpected request');
 };
 const req=new Request('https://synthetic.invalid',{method:'POST',headers:token?{Authorization:'Bearer synthetic.token'}:{},body:JSON.stringify({action,args:{id},owner:true})});
 const response=await handle(req,n=>n==='SUPABASE_URL'?'https://service.invalid':'synthetic-service-key',send);
 return {status:response.status,result:await response.json(),serviceCalls,body};
}
assert.equal((await request({token:false})).status,401);
for(const options of [{editor:false},{anonymous:true},{email:false}]){const r=await request(options);assert.equal(r.status,403);assert.equal(r.serviceCalls,0);}
let r=await request();assert.equal(r.status,200);assert.deepEqual(r.result.data.courses,[{id:'c1'}]);assert.deepEqual(r.result.data.proposals,[{course_id:'c1'}]);assert.equal(r.body.p_owner,false);
r=await request({action:'save',id:'c2'});assert.equal(r.status,403);assert.equal(r.serviceCalls,0);
r=await request({action:'save'});assert.equal(r.status,200);assert.equal(r.result.data.pending_approval,true);assert.equal(r.body.p_owner,false);
assert.equal((await request({action:'history'})).status,403);
r=await request({owner:true});assert.equal(r.result.data.courses.length,2);assert.equal(r.body.p_owner,true);
r=await request({source:'away',owner:false});assert.equal(r.status,200);assert.equal(r.result.data.courses.length,2);assert.equal(r.body.p_owner,false);
console.log('Passed: verified course identities, unapproved/suspended/anonymous denial, approved-course scope, owner authority and preserved proposal-only edits.');
