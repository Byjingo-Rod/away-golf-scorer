import {createGroupApi,validateAccountConfig} from './group-api.mjs';
const instruction=document.getElementById('gesPlayerInstructions');
const generic='Record the names and GolfLink numbers of each golfer in your group here. GolfLink numbers are optional for golfers who do not have one.';
let request=0,client;
async function update(){
 const serial=++request;if(!instruction)return;instruction.textContent=generic;
 try{
  if(!client){const config=validateAccountConfig(window.GES_ACCOUNT_CONFIG);client=window.supabase.createClient(config.url,config.key,{auth:{storageKey:'golfEventScorerGroupAuth',persistSession:true,detectSessionInUrl:false,autoRefreshToken:true}});}
  const {data,error}=await client.auth.getUser();if(error||!data.user||data.user.is_anonymous)return;
  const groups=await createGroupApi(client).groups();if(serial!==request)return;
  const selected=sessionStorage.getItem('gesSelectedGroup');
  const group=groups.find(g=>g.id===selected)||(groups.length===1?groups[0]:null);
  if(group?.golfer_count){instruction.textContent=`You have indicated you have ${group.golfer_count} players in your golf group (${group.name}). Record the names and GolfLink numbers of each of your players here. GolfLink numbers are optional for golfers who do not have one.`;}
 }catch{if(serial===request)instruction.textContent=generic;}
}
window.addEventListener('pageshow',update);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
update();
