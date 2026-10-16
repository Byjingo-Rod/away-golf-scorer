/* Separate rating and scorecard sets; legacy course fields remain the men's set. */
(function(root){
 const keys=['teeDetails','teeScorecards','versions','activeVersionId','activeScorecardTee','needsReview','teePositionCount'];
 const positionKeys=['back','middle','front','tee4','tee5'];
 const labels={back:'Back',middle:'Middle',front:'Front',tee4:'Tee 4',tee5:'Tee 5'};
 function positionCount(categoryData){const n=Number(categoryData?.teePositionCount);return Number.isInteger(n)&&n>=1&&n<=5?n:Math.max(3,...positionKeys.map((tee,i)=>categoryData?.teeScorecards?.[tee]?i+1:0));}
 function positions(categoryData){return positionKeys.slice(0,positionCount(categoryData));}
 function storedCount(course,category){const d=data(course,category);return positions(d).filter(tee=>d.teeScorecards?.[tee]?.par?.some(v=>String(v??'').trim())).length;}
 const blank=()=>({teeDetails:Object.fromEntries(['back','middle','front'].map(tee=>[tee,{name:tee[0].toUpperCase()+tee.slice(1),colour:'',slope:'',scratch:'',par:'',length:''}])),teeScorecards:{},versions:[]});
 function data(course,category='men',create=false){if(!course)return blank();if(category!=='women')return course;if(!course.womenTeeData&&create)course.womenTeeData=blank();return course.womenTeeData||blank();}
 function copyMen(course){const result=structuredClone(course);const target=blank();for(const key of keys)if(course[key]!==undefined)target[key]=structuredClone(course[key]);target.needsReview=true;result.womenTeeData=target;return result;}
 function copyMenTee(course,sourceTee,destinationTee){
  const tees=positionKeys;if(!tees.includes(sourceTee)||!tees.includes(destinationTee))throw Error('Choose a Men’s source tee and a Women’s destination tee.');
  const card=course?.teeScorecards?.[sourceTee];if(!card||!['par','index','metres'].every(key=>Array.isArray(card[key])&&card[key].length===18)||!card.par.some(value=>String(value??'').trim()))throw Error('The selected Men’s tee has no saved scorecard to copy.');
  const result=structuredClone(course),target=data(result,'women',true),name=target.teeDetails?.[destinationTee]?.name||labels[destinationTee];
  target.teeDetails||={};target.teeScorecards||={};target.teeDetails[destinationTee]={...structuredClone(course.teeDetails?.[sourceTee]||{}),name};target.teeScorecards[destinationTee]={...structuredClone(card),tee:destinationTee};
  target.activeScorecardTee=destinationTee;target.needsReview=true;return result;
 }
 function category(event,id,day,profile=()=>null){if(!event?.courseCategoryVersion)return 'men';const actual=root.GolfSharedPositions?.actual(event,id,day)||id;return (event.gaCategories?.[String(actual)]||profile(actual,day)?.gaCategory||'men')==='women'?'women':'men';}
 const api={data,copyMen,copyMenTee,category,keys,positionKeys,labels,positionCount,positions,storedCount};if(typeof module!=='undefined')module.exports=api;root.GolfCourseCategories=api;
})(typeof window!=='undefined'?window:globalThis);
