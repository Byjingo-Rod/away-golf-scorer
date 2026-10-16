/* Shared side-by-side review. All course values are rendered as text. */
(() => {
  const text=value=>value==null?'':String(value).trim();
  const pair=(label,left,right)=>({label,left:text(left),right:text(right),different:text(left)!==text(right)});
  const card=(doc,tee)=>doc.teeScorecards?.[tee] || (tee==='middle'?(doc.versions||[]).find(v=>String(v.id)===String(doc.activeVersionId))||doc.versions?.[0]:null);
  function comparison(left={},right={},nested=false) {
    const fields=[['name','Course name'],['country','Country'],['state','State / Province'],['region','Region / Area'],['address','Address'],['website','Website'],['clubPhone','Club phone'],['clubEmail','Club email'],['phone','Phone'],['email','Email'],['proName','Professional'],['proPhone','Pro shop phone'],['proEmail','Pro shop email'],['mapLink','Map link'],['notes','Notes'],['available','Available']];
    const metadata=fields.map(([key,label])=>pair(label,key==='country'?left[key]||'Australia':left[key],key==='country'?right[key]||'Australia':right[key])).filter(r=>r.left||r.right);
    const keys=[...new Set(['back','middle','front',...Object.keys(left.teeScorecards||{}),...Object.keys(right.teeScorecards||{}),...Object.keys(left.teeDetails||{}),...Object.keys(right.teeDetails||{})])];
    const tees=keys.map(tee=>{
      const a=card(left,tee),b=card(right,tee),ai=left.teeDetails?.[tee]||{},bi=right.teeDetails?.[tee]||{};
      if(!a&&!b&&!Object.values(ai).some(v=>text(v))&&!Object.values(bi).some(v=>text(v)))return null;
      const info=[pair('Card stored',a?'Yes':'No',b?'Yes':'No'),...['name','colour','slope','scratch','par','length'].map(key=>pair({name:'Tee name',colour:'Tee colour',slope:'Slope',scratch:'Scratch rating',par:'Total par',length:'Tee length'}[key],ai[key]??a?.[key],bi[key]??b?.[key])),pair('Display unit',a?.distanceUnit|| (a?'metres':''),b?.distanceUnit||(b?'metres':'')),pair('Input unit',a?.distanceInputUnit||(a?'metres':''),b?.distanceInputUnit||(b?'metres':''))];
      const columns=[['par','Par'],['index','Index'],['metres','Metres']];if(a?.yards||b?.yards)columns.push(['yards','Yards']);
      const holes=a||b?Array.from({length:18},(_,i)=>({hole:i+1,values:columns.map(([key,label])=>pair(label,a?.[key]?.[i],b?.[key]?.[i]))})):[];
      return {tee,info,columns,holes};
    }).filter(Boolean);
    if(!nested&&(left.womenTeeData||right.womenTeeData)){
      const women=comparison(left.womenTeeData||{},right.womenTeeData||{},true);tees.push(...women.tees.map(t=>({...t,tee:'Women — '+t.tee})));metadata.push(pair('Women’s copied data awaiting review',left.womenTeeData?.needsReview?'Yes':'No',right.womenTeeData?.needsReview?'Yes':'No'));
    }
    return {metadata,tees,differences:metadata.filter(r=>r.different).length+tees.reduce((n,t)=>n+t.info.filter(r=>r.different).length+t.holes.reduce((s,h)=>s+h.values.filter(v=>v.different).length,0),0)};
  }
  if(typeof module!=='undefined')module.exports={comparison};
  if(typeof window==='undefined')return;
  const add=(parent,tag,value)=>{const n=document.createElement(tag);if(value!=null)n.textContent=value;parent.append(n);return n;};
  function style(){if(document.getElementById('golfComparisonStyles'))return;const s=add(document.head,'style');s.id='golfComparisonStyles';s.textContent=`.golfCardCompare{color:#142f40;background:#fff;padding:12px;border-radius:10px;margin:12px 0}.golfCardCompare .compareScroll{overflow-x:auto;max-width:100%}.golfCardCompare table{width:100%;min-width:620px;border-collapse:collapse;table-layout:fixed;margin:12px 0}.golfCardCompare th,.golfCardCompare td{padding:8px;border:1px solid #a7b8c3;color:#142f40;background:#fff;text-align:center;overflow-wrap:anywhere;font-size:15px}.golfCardCompare th{background:#dceaf2;font-weight:700}.golfCardCompare td.changed{background:#ffe19a;color:#382400;font-weight:700;box-shadow:inset 0 0 0 2px #b76c00}.golfCardCompare tr:nth-child(even) td:not(.changed){background:#f1f5f7}.golfCardCompare .compareMeta th{width:22%;text-align:left}.golfCardCompare h4{font-size:19px;color:#142f40;margin:18px 0 8px}.modal:has(.golfCardCompare){width:min(1200px,calc(100vw - 32px));max-width:1200px}.golfCardCompare .compareLegend{color:#142f40;font-size:16px;font-weight:600}.golfCardCompare .holeNumber{width:45px}.golfCardCompare .columnStart{border-left:3px solid #516d80}`;}
  function valueCell(row,value,different,start=false){const td=add(row,'td',value||'—');if(different){td.classList.add('changed');td.setAttribute('aria-label',(value||'Blank')+' — differs between copies');}if(start)td.classList.add('columnStart');return td;}
  function metadata(parent,rows,leftLabel,rightLabel){const wrap=add(parent,'div');wrap.className='compareScroll';const table=add(wrap,'table');table.className='compareMeta';const head=add(table,'thead'),tr=add(head,'tr');['Detail',leftLabel,rightLabel].forEach(x=>{const th=add(tr,'th',x);th.scope='col';});const body=add(table,'tbody');for(const r of rows){const row=add(body,'tr');add(row,'th',r.label).scope='row';valueCell(row,r.left,r.different);valueCell(row,r.right,r.different,true);}}
  function renderComparison(host,left,right,leftLabel='Current master card',rightLabel='Proposed card') {
    style();const model=comparison(left,right),section=add(host,'div');section.className='golfCardCompare';
    add(section,'p',model.differences?`${model.differences} differing value(s). Amber cells show exactly where the copies differ.`:'No differences in the displayed course details, ratings or hole values. The copies may differ only in saved history or internal metadata.').className='compareLegend';
    add(section,'p','Both copies are shown in full below. On a narrow screen, swipe the tables sideways to see both copies.');
    metadata(section,model.metadata,leftLabel,rightLabel);
    for(const tee of model.tees){add(section,'h4',tee.tee[0].toUpperCase()+tee.tee.slice(1)+' tee');metadata(section,tee.info,leftLabel,rightLabel);if(!tee.holes.length)continue;
      const wrap=add(section,'div');wrap.className='compareScroll';const table=add(wrap,'table'),head=add(table,'thead'),top=add(head,'tr');const hole=add(top,'th','Hole');hole.rowSpan=2;hole.className='holeNumber';hole.scope='col';for(const label of [leftLabel,rightLabel]){const th=add(top,'th',label);th.colSpan=tee.columns.length;th.scope='colgroup';}const labels=add(head,'tr');for(let side=0;side<2;side++)for(const [i,[,label]] of tee.columns.entries()){const th=add(labels,'th',label);th.scope='col';if(side&&i===0)th.classList.add('columnStart');}
      const body=add(table,'tbody');for(const h of tee.holes){const row=add(body,'tr');add(row,'th',h.hole).scope='row';for(let side=0;side<2;side++)h.values.forEach((v,i)=>valueCell(row,side?v.right:v.left,v.different,side&&i===0));}
      const totals=add(body,'tr');add(totals,'th','Total').scope='row';for(let side=0;side<2;side++)tee.columns.forEach(([key],i)=>{const sum=which=>{const values=tee.holes.map(h=>which?h.values[i].right:h.values[i].left);return key==='index'?'—':values.every(v=>v!==''&&Number.isFinite(Number(v)))?String(values.reduce((n,v)=>n+Number(v),0)):'Incomplete';};valueCell(totals,sum(side),sum(0)!==sum(1),side&&i===0);});
    }
    return model;
  }
  window.GolfCatalogueReview={renderComparison,async render(host,api,changed=()=>{}){
    host.replaceChildren();add(host,'h3','Master Course Reviews');const status=add(host,'p','Loading…');
    try{const rows=await api.courseReviews();status.textContent=rows.length?`${rows.length} course correction(s) or migration difference(s) need review.`:'No master course changes need review.';
      for(const r of rows){const item=add(host,'section');add(item,'h4',r.name);renderComparison(item,r.current||{},r.incoming||{});const buttons=[];
        for(const [accept,label] of [[true,'Accept proposed course'],[false,'Keep current course']]){const b=add(item,'button',label);b.type='button';buttons.push(b);b.onclick=async()=>{if(!confirm(`${label} for ${r.name}? Previous details remain in history.`))return;buttons.forEach(n=>n.disabled=true);try{await api.resolveCourse(r.id,accept,r.revision);await changed();await this.render(host,api,changed);}catch(e){status.textContent=e.message;buttons.forEach(n=>n.disabled=false);}};}
      }
    }catch(e){status.textContent='Shared catalogue review is unavailable: '+e.message;}
  }};
})();
