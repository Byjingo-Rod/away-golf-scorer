import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const block=app.slice(app.indexOf('  function editPlayerProfile('),app.indexOf('  function renderPlayersAdmin()'));
const makeNode=value=>({value,checked:false,disabled:false,hidden:false,classList:{add(){},remove(){}}});
function editor(record,choice,id){
 const nodes=Object.fromEntries(Object.entries({epFirst:'Jane',epLast:'Smith',epHandicapStatus:choice,epGolfLink:choice==='insert'?'0001234567':'',epNickname:'Janey',epPhone:'0400123456',epStreetType:'Street',epGa:'',epGaCategory:'men',epNotes:'Contact notes',epStatus:'active',epHomeClub:'Oatlands'}).map(([k,v])=>['#'+k,makeNode(v)]));
 nodes['#sidePanel']=makeNode('');nodes['#sideContent']=makeNode('');nodes['#epGaPlus']=makeNode('');nodes['#epOtherStreetLabel']=makeNode('');
 const address=['houseNo','streetName','otherStreetType','suburb','state','postCode','legacyAddress'].map((k,i)=>({...makeNode(['12','Golf Road','','Sydney','NSW','2000',''][i]),dataset:{playeraddress:k}}));
 const store={players:record.pendingNewPlayer?[]:[record]},alerts=[];let saved=0;
 const context={store,W:{},player:()=>record,profileCourseHandicaps:()=>[],profileHistoryText:()=>'',esc:v=>String(v??''),$:q=>nodes[q]||(nodes[q]=makeNode('')),$$:q=>q==='[data-playeraddress]'?address:[],save:()=>saved++,playerInfo:()=>{},alert:s=>alerts.push(s),handicapMagnitude:v=>v,structuredClone};
 vm.createContext(context);vm.runInContext(block,context);context.editPlayerProfile(id||record);
 return {context,nodes,store,alerts,save:()=>nodes['#savePlayerProfile'].onclick(),cancel:()=>nodes['#cancelPlayerProfile'].onclick(),saved:()=>saved};
}
// Missing fields fail before modifying an existing player or saving.
const old={id:'p1',name:'Jane Smith',golfLink:'0001234567',ga:12.4,gaUpdatedAt:'2026-10-01',eventsPlayed:7,lastEvent:'Federal',courseHandicaps:{c1:13}};
let edit=editor(structuredClone(old),'');edit.save();assert.equal(edit.saved(),0);assert.equal(edit.store.players[0].name,old.name);assert.equal(edit.alerts.length,1);
edit=editor(structuredClone(old),'none');edit.save();const p=edit.store.players[0];assert.equal(p.noOfficialHandicap,true);assert.equal(p.golfLink,'');assert.equal(p.cellPhone,'0400123456');assert.equal(p.addressDetails.suburb,'Sydney');assert.equal(p.ga,12.4);assert.equal(p.eventsPlayed,7);assert.equal(p.lastEvent,'Federal');assert.equal(p.courseHandicaps.c1,13);
edit=editor({id:'new',name:'',pendingNewPlayer:true},'insert');edit.cancel();assert.equal(edit.store.players.length,0);
edit=editor({id:'new',name:'',pendingNewPlayer:true},'insert');edit.save();assert.equal(edit.store.players.length,1);assert.equal(edit.store.players[0].golfLink,'0001234567');assert.equal(edit.store.players[0].pendingNewPlayer,undefined);
const functions=app.slice(app.indexOf('  function roundDailyHandicap('),app.indexOf('  function applyCalculatedEventHandicaps('));
const helper=app.slice(app.indexOf('function estimateEventGa('),app.indexOf('  function gesProposedHandicapRow('));
const calc=vm.runInNewContext(functions+';calculateDailyHandicap'),estimate=vm.runInNewContext(helper+';estimateEventGa');
for(const category of ['men','women'])for(const hcp of [-3,0,19,36]){const r={valid:true,slope:131,scratch:71.3,par:71},ga=estimate(hcp,r,category,calc);assert.ok(calc(ga,r,category)===hcp);}
console.log('Profile validation, leading zeros, explicit guest status, contacts, history retention, cancelled/new-player entry and inverse handicap checks passed.');
