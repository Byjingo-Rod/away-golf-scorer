export function acceptedDetails(original,name,fields,tees,now=new Date().toISOString()) {
 const details=structuredClone(original||{});Object.assign(details,fields,{name:name.trim()});
 details.teeDetails={...details.teeDetails};details.teeScorecards={};details.versions=[...(details.versions||[])];
 for(const [key,tee] of Object.entries(tees)){
  details.teeDetails[key]={...details.teeDetails[key],...tee.info};
  if(!tee.included)continue;
  const card={...tee.card,tee:key,par:tee.card.par.map(Number),index:tee.card.index.map(x=>String(x).trim()),metres:tee.card.metres.map(Number)};
  const info=details.teeDetails[key];info.par=String(card.par.reduce((a,b)=>a+b,0));info.length=String(card.metres.reduce((a,b)=>a+b,0));
  const label=info.name||key;
  if(!/^\d+$/.test(String(info.slope))||+info.slope<55||+info.slope>155)throw Error(`${label}: enter a slope rating from 55 to 155.`);
  if(!/^\d+(\.\d+)?$/.test(String(info.scratch))||+info.scratch<40||+info.scratch>100)throw Error(`${label}: enter the scratch rating.`);
  if(card.par.length!==18||card.index.length!==18||card.metres.length!==18)throw Error(`${label}: complete all 18 holes.`);
  const seen=new Set(),secondarySeen=new Set();
  for(let i=0;i<18;i++){
   if(!Number.isInteger(card.par[i])||card.par[i]<3||card.par[i]>6)throw Error(`${label}, hole ${i+1}: enter par from 3 to 6.`);
   if(!/^([1-9]|1[0-8])(\/(19|2[0-9]|3[0-6]))?$/.test(card.index[i]))throw Error(`${label}, hole ${i+1}: enter index 1–18, optionally followed by /19–36.`);
   const index=card.index[i].split('/')[0];if(seen.has(index))throw Error(`${label}: index ${index} is used twice.`);seen.add(index);
   const secondary=card.index[i].split("/")[1];if(secondary){if(secondarySeen.has(secondary))throw Error(`${label}: index ${secondary} is used twice.`);secondarySeen.add(secondary);}
   if(!Number.isInteger(card.metres[i])||card.metres[i]<1||card.metres[i]>1000)throw Error(`${label}, hole ${i+1}: enter metres from 1 to 1000.`);
  }
  details.teeScorecards[key]=card;
  const version={id:`accepted-${key}-${now}`,teeName:info.name||key,tee:key,...card,slope:info.slope,scratch:info.scratch,createdAt:now,confirmedDate:now.slice(0,10),note:'Owner accepted course details'};
  details.versions.push(version);
 }
 if(!Object.keys(details.teeScorecards).length)throw Error('Select and complete at least one tee scorecard.');
 const active=details.activeScorecardTee;
 if(!details.teeScorecards[active])details.activeScorecardTee=Object.keys(details.teeScorecards)[0];
 details.activeVersionId=details.versions.findLast(v=>v.tee===details.activeScorecardTee)?.id;
 return details;
}

// Copy hole values only. Tee ratings and identity remain independent.
export function copyTeeCard(source,destinationTee,column='whole') {
 const copy={tee:destinationTee};
 if(!['whole','par','index','metres'].includes(column))throw Error('Choose Par, Index or Metres.');
 for(const key of column==='whole'?['par','index','metres']:[column]) {
  if(!Array.isArray(source?.[key])||source[key].length!==18)throw Error('The source tee must contain 18 holes.');
  copy[key]=source[key].map(value=>String(value??''));
 }
 if(!Object.entries(copy).some(([key,values])=>key!=='tee'&&values.some(value=>value.trim())))throw Error('Choose a tee with scorecard numbers to copy.');
 return copy;
}
