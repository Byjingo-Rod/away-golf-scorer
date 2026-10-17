import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
globalThis.GolfCourseCategories=require('../course-categories.js');
const {comparison}=require('../catalogue-review.js');

const card=()=>({par:Array(18).fill(4),index:Array.from({length:18},(_,i)=>i+1),metres:Array(18).fill(350)});
const course={teePositionCount:4,teeScorecards:{back:card(),middle:card(),front:card(),tee4:card()},teeDetails:{
  back:{name:'Back'},middle:{name:'Middle'},front:{name:'Front'},tee4:{name:'Tee 4'}
}};
const model=comparison(course,structuredClone(course));
assert.deepEqual(model.tees.map(t=>t.label),['Back','Middle 1','Middle 2','Front']);
assert.deepEqual(model.tees.map(t=>t.info.find(row=>row.label==='Tee name').left),['Back','Middle 1','Middle 2','Front']);
assert.equal(model.differences,0);
console.log('catalogue comparison uses dynamic tee position names');
