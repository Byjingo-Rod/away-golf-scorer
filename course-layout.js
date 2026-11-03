/* Event-day overlays. Master cards never change. Score keys are playing positions;
   Eclectic keys are the original 18 positions represented by those holes. */
(() => {
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const initial=()=>Array.from({length:18},(_,i)=>({physical:i+1,eclectic:i+1}));
  function step(sequence, change) {
    const out=+change.out,replacement=+change.replacement,at=sequence.findIndex(h=>h.physical===out);
    if(at<0 || !Number.isInteger(replacement) || replacement<1 || replacement>99 || sequence.some((h,i)=>i!==at && h.physical===replacement))throw Error('Choose a hole in play and a distinct replacement number from 1 to 99.');
    const next=copy(sequence),removed=next.splice(at,1)[0];let position=at;
    if(change.placement!=='keep'){
      if(!['before','after'].includes(change.placement))throw Error('Choose Keep position, Before or After.');
      position=next.findIndex(h=>h.physical===+change.beside);
      if(position<0)throw Error('Choose a remaining course hole to place the replacement beside.');
      if(change.placement==='after')position++;
    }
    next.splice(position,0,{physical:replacement,eclectic:removed.eclectic});return next;
  }
  function sequence(layout) {return (layout?.changes||[]).reduce(step,initial());}
  function card(base,layout,key) {
    let result=copy(base||{}),seq=initial();
    for(const change of layout?.changes||[]){
      const at=seq.findIndex(h=>h.physical===+change.out),next=step(seq,change),details=change.details?.[key];
      if(!details || !Number.isInteger(+details.par) || +details.par<3 || +details.par>6)throw Error('Enter a replacement par from 3 to 6 for '+key+'.');
      const distance=details.length==null || String(details.length).trim()===''?'':+details.length;
      if(distance!=='' && (!Number.isFinite(distance)||distance<=0||distance>2000))throw Error('Length must be blank or a positive distance up to 2000 metres.');
      const previous=result;result={...previous};
      for(const field of ['par','index','metres',...(previous.yards?['yards']:[])])result[field]=next.map(h=>{
        if(h.physical===+change.replacement){if(field==='par')return +details.par;if(field==='metres')return distance;if(field==='yards')return distance===''?'':Math.round(distance/0.9144);return previous[field]?.[at]??'';}
        return previous[field]?.[seq.findIndex(old=>old.physical===h.physical)]??'';
      });
      if(change.indexMode==='club')result.index=copy(change.indexes?.[key]||[]);
      validateIndexes(result.index);seq=next;
    }
    return result;
  }
  function validateIndexes(indexes) {
    if(!Array.isArray(indexes)||indexes.length!==18)throw Error('Enter all 18 stroke indexes.');
    const primary=indexes.map(x=>+String(x).split('/')[0]),secondary=indexes.map(x=>String(x).split('/')[1]);
    if(primary.some(x=>!Number.isInteger(x)||x<1||x>18)||new Set(primary).size!==18)throw Error('Primary indexes must contain 1–18 exactly once.');
    if(secondary.some(x=>x!==undefined) && (secondary.some(x=>!/^\d+$/.test(x||'')||+x<19||+x>36)||new Set(secondary.map(Number)).size!==18))throw Error('Second indexes must contain 19–36 exactly once, or be omitted for every hole.');
    if(indexes.some(x=>!/^\d+(\/\d+)?$/.test(String(x).trim())))throw Error('Use an index or primary/second index.');
  }
  function rating(base,layout,key,par) {
    const result=copy(base||{});
    for(const change of layout?.changes||[])if(change.ratingMode==='club')Object.assign(result,change.ratings?.[key]);
    result.slope=+result.slope;result.scratch=+result.scratch;result.par=par;
    if(!Number.isFinite(result.slope)||result.slope<55||result.slope>155||!Number.isFinite(result.scratch)||result.scratch<=0||result.scratch>100)throw Error('Confirm valid course rating and slope for '+key+'.');
    return result;
  }
  function eclectic(points,layout) {const result=Array(18).fill(null);sequence(layout).forEach((h,i)=>result[h.eclectic-1]=points[i]??null);return result;}
  function playingHole(layout,original) {return sequence(layout).findIndex(h=>h.eclectic===+original)+1;}
  function remap(oldLayout,newLayout,hole) {const old=sequence(oldLayout)[+hole-1];return old ? sequence(newLayout).findIndex(h=>h.physical===old.physical)+1 : 0;}
  function label(layout,position) {const h=sequence(layout)[+position-1];return h?`${position}${h.physical!==+position?' / '+h.physical:''}${h.physical===h.eclectic && (layout?.changes||[]).some(c=>+c.replacement===h.physical)?' · Modified hole':''}`:String(position);}
  function publicationTargetMatches(target,cloud,event) {
    return !!target && target.role==='organiser' && !!target.eventId &&
      target.eventId===String(cloud?.eventId||'') && cloud?.role==='organiser' &&
      target.workspaceId===String(event?.workspaceId||'') &&
      target.courseId===String(event?.['course'+target.day]||'');
  }
  function acceptedEventPlan(result,bundle) {
    const candidates=[result?.saved_data?.event,result?.saved_data?.event_data?.event,
      result?.saved_data,bundle?.event?.event_data?.event,bundle?.event?.event_data];
    return candidates.find(value=>value&&typeof value==='object'&&!Array.isArray(value)&&value.courseLayouts)||null;
  }
  function restoreAcceptedEvent(accepted,local) {
    if(!accepted||typeof accepted!=='object'||Array.isArray(accepted))throw Error('The accepted event plan is unavailable. Refresh before continuing.');
    const restored=copy(accepted),localFields=['workspaceId','joinCode','courseSnapshot','scoring','roundFinalised','prizesAwarded',
      'playerRoundMode','playerHolePos','playerPreviewId','playerPreviewDay','playerPreviewAck','playerRulesOpen','playerLayoutAck',
      'playerVerificationStage','returnToMarkedVerification','leaderboardTab','leaderboardView','liveControlDay','activeGroupDay',
      'leaderboardScrollLeft','finalUpdateCloudSentAt'];
    for(const key of localFields)if(Object.hasOwn(local||{},key))restored[key]=copy(local[key]);
    return restored;
  }
  window.GolfCourseLayout={initial,step,sequence,card,validateIndexes,rating,eclectic,playingHole,remap,label,publicationTargetMatches,acceptedEventPlan,restoreAcceptedEvent};
})();
