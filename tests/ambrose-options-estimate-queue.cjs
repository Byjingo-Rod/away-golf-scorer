const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||'app.js','utf8');
const rules=source.slice(source.indexOf('  function ambroseRulesText('),source.indexOf('  function specialRulesEditorHtml('));
const rc={store:{event:{}}};vm.createContext(rc);vm.runInContext(rules,rc);
for(const canPlay of [true,false])for(const secondPutt of [true,false]){
 const text=rc.ambroseRulesText({ambroseMinimumDrives:4,ambroseSelectedPlayerCanPlay:canPlay,ambroseSecondPuttBeforeAll:secondPutt,ambroseScoringMode:'scorerOnly'});
 assert(text.includes('At least 4 drives'));assert(text.includes('one club length'));assert(text.includes('all players may putt regardless'));
 assert(text.includes(canPlay?'including the owner':'cannot play the next shot'));
 assert(text.includes(secondPutt?'may take a second putt before':'No player may take a second putt until'));
 assert(text.includes('One nominated team scorer'));
}
assert(rc.ambroseRulesText({ambroseMinimumDrives:0}).includes('No minimum number'));
// Fifty players: seven unresolved estimates must appear at the top, independent
// of category and original position; each completion leaves the pending queue.
const people=Array.from({length:50},(_,i)=>({id:'p'+i,name:'Member '+String(i).padStart(2,'0'),noOfficialHandicap:i>=43,gaCategory:i%2?'women':'men',demoCode:'D'+i}));
const nodes=new Map(),get=q=>{if(!nodes.has(q))nodes.set(q,{innerHTML:'',scrollTop:900,classList:{add(){}}});return nodes.get(q);};
const ctx={store:{},W:{event:{course1:'c',course2:'c2',gaHandicaps:{},gaCategories:{},proposedHandicaps:{}}},player:id=>people.find(p=>p.id===id),surnameKey:n=>n,$:get,esc:String,eventGaCategory:id=>people.find(p=>p.id===id).gaCategory,enabledEventTeesForCategory:()=>['middle'],teeRatingForDailyHandicap:()=>({valid:true}),eventGaHandicap:id=>ctx.W.event.gaHandicaps[id]??'',calculateDailyHandicap:ga=>Math.round(ga),eventDays:()=>[1,2],wizardPlanningPlayers:()=>people.map(p=>p.id),gesProposedHandicapRow:id=>'<div>'+id+'</div>',gesBindProposedHandicaps:()=>{},console};
vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('  function playerIdentityLabel('),source.indexOf('  function ntpNameLineCount(')),ctx);vm.runInContext(source.slice(source.indexOf('  function handicapPlayerName('),source.indexOf('  function gesProposedHandicapRow(')),ctx);
const ids=people.map(p=>p.id);assert.equal(ctx.openNonGolfLinkEstimates(1,ids),true);let html=get('#modalContent').innerHTML;assert(html.includes('7 players need'));assert.equal((html.match(/estimateQueuePlayer/g)||[]).length,7);assert(html.includes('disabled>Calculate handicaps'));assert.equal(get('#modalShade').scrollTop,0);
for(let i=43;i<50;i++){
 const id='p'+i;ctx.W.event.gaHandicaps[id]=18;ctx.W.event.proposedHandicaps[id]={day:1,courseId:'c',tee:'middle',category:people[i].gaCategory,ga:18,handicap:18};
 assert.equal(ctx.eventEstimateIsUsable(id),true);
 const pending=ctx.openNonGolfLinkEstimates(1,ids);
 assert.equal(pending,i<49);
 if(pending){html=get('#modalContent').innerHTML;assert.equal((html.match(/estimateQueuePlayer/g)||[]).length,49-i);assert(!html.split('<details>')[0].includes('data-eventga="'+id+'"'));assert(html.split('<details>')[1].includes('D'+i));}
}
ctx.W.event.course1='changed';assert.equal(ctx.eventEstimateIsUsable('p49'),false);ctx.W.event.course1='c';ctx.W.event.proposedHandicaps.p49.category='men';assert.equal(ctx.eventEstimateIsUsable('p49'),false);
// The actual setup route gates before rendering its alphabetical handicap list.
const route=source.slice(source.indexOf('  function openWizardHandicapEntry('),source.indexOf('  function ',source.indexOf('  function openWizardHandicapEntry(')+20));
assert(route.indexOf('if(openNonGolfLinkEstimates(day,allIds))return')<route.indexOf('const gaRows'));
for(const field of ['ambroseSelectedPlayerCanPlay','ambroseSecondPuttBeforeAll'])assert(source.includes(field+': W.event.'+field));
console.log('Ambrose choices and text passed all combinations; a 50-player queue handles seven estimates, moves completed names, validates category/course changes and gates calculation.');
