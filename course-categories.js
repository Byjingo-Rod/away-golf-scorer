/* Separate rating and scorecard sets; legacy course fields remain the men's set. */
(function(root){
 const keys=['teeDetails','teeScorecards','versions','activeVersionId','activeScorecardTee','needsReview'];
 const blank=()=>({teeDetails:Object.fromEntries(['back','middle','front'].map(tee=>[tee,{name:tee[0].toUpperCase()+tee.slice(1),colour:'',slope:'',scratch:'',par:'',length:''}])),teeScorecards:{},versions:[]});
 function data(course,category='men',create=false){if(!course)return blank();if(category!=='women')return course;if(!course.womenTeeData&&create)course.womenTeeData=blank();return course.womenTeeData||blank();}
 function copyMen(course){const result=structuredClone(course);const target=blank();for(const key of keys)if(course[key]!==undefined)target[key]=structuredClone(course[key]);target.needsReview=true;result.womenTeeData=target;return result;}
 function category(event,id,day,profile=()=>null){if(!event?.courseCategoryVersion)return 'men';const actual=root.GolfSharedPositions?.actual(event,id,day)||id;return (event.gaCategories?.[String(actual)]||profile(actual,day)?.gaCategory||'men')==='women'?'women':'men';}
 const api={data,copyMen,category,keys};if(typeof module!=='undefined')module.exports=api;root.GolfCourseCategories=api;
})(typeof window!=='undefined'?window:globalThis);
