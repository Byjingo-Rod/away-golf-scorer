import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {Library}=createRequire(import.meta.url)('../course-library.js');
const copy=x=>JSON.parse(JSON.stringify(x));
async function sync({same=true,authoritative=true,status=null}={}){
 const master={id:'c',name:'Master',country:'Australia'},submitted={...master,...(!same?{notes:'Retain this proposed correction'}:{})};
 const store={courses:[copy(master)],courseCountries:['Australia'],courseLibrary:{authority:'a',bases:{c:{revision:2,data:copy(master)}},previousAuthorityBases:{c:{revision:1,data:{obsolete:true}}},pending:{},conflicts:{},countriesPending:[],proposals:{c:{id:'review',data:submitted}}}};
 const library=new Library({store:()=>store,persist:()=>true,online:()=>true,api:{loadCourseLibrary:async()=>({authority:'a',courses:[{id:'c',data:master,revision:2}],countries:['Australia'],proposals:status?[{id:'review',course_id:'c',status}]:[],proposalsAuthoritative:authoritative})}});
 await library.sync();return {store,library,submitted};
}
let r=await sync();assert.equal(r.store.courseLibrary.proposals.c,undefined);assert.equal(r.store.courseLibrary.previousAuthorityBases.c,undefined);
r=await sync({same:false});assert.equal(r.store.courseLibrary.proposals.c,undefined);assert.equal(r.store.courseLibrary.pending.c.notes,r.submitted.notes);assert(r.store.courseLibrary.conflicts.c);assert.equal(r.library.status('c'),'Review two copies');assert(r.store.courseLibrary.previousAuthorityBases.c);
r=await sync({authoritative:false});assert(r.store.courseLibrary.proposals.c,'an incomplete response must not retire a proposal');
for(const status of ['accepted','kept']){r=await sync({status});assert.equal(r.store.courseLibrary.proposals.c,undefined);assert.equal(r.store.courseLibrary.reviewedProposals[0].status,status);assert.equal(r.store.courseLibrary.reviewedProposals[0].data,undefined);}
console.log('Passed: accepted/rejected receipts, legacy deleted proposals, visible retained alternatives, incomplete-response protection and obsolete-base cleanup.');
