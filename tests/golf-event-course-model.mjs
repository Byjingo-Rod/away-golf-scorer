import assert from 'node:assert/strict';
import {acceptedDetails,copyTeeCard} from '../products/golf-event-scorer-assets/course-model.mjs';
const info={name:'Middle',colour:'White',slope:'130',scratch:'72.5'};
const card={par:Array(18).fill('4'),index:Array.from({length:18},(_,i)=>String(i+1)),metres:Array(18).fill('350')};
const original={proEmail:'keep@example.invalid',versions:[{id:'old'}],teeDetails:{middle:{custom:'keep'}},activeScorecardTee:'middle'};
const result=acceptedDetails(original,'Course',{address:'New address'},{middle:{info,included:true,card}});
assert.equal(result.proEmail,original.proEmail);assert.equal(result.teeDetails.middle.custom,'keep');assert.equal(result.teeDetails.middle.par,'72');assert.equal(result.teeDetails.middle.length,'6300');assert.equal(result.versions[0].id,'old');assert.equal(original.versions.length,1);
assert.throws(()=>acceptedDetails(original,'Course',{}, {middle:{info,included:true,card:{...card,index:Array(18).fill('1')}}}),/used twice/);
assert.throws(()=>acceptedDetails(original,'Course',{}, {middle:{info:{...info,scratch:''},included:true,card}}),/scratch/);
assert.throws(()=>acceptedDetails(original,'Course',{}, {middle:{info,included:true,card:{...card,metres:Array(18).fill('')}}}),/metres/);
const doubleIndex=card.index.map((x,i)=>x+'/'+(i+19));assert.equal(acceptedDetails(original,'Course',{}, {middle:{info,included:true,card:{...card,index:doubleIndex}}}).teeScorecards.middle.index[0],'1/19');
console.log('Passed: course preservation, totals, history, dual index and invalid card checks');

const copied=copyTeeCard(card,'back');assert.equal(copied.tee,'back');assert.deepEqual(copied.index,card.index);assert.deepEqual(copied.metres,card.metres);copied.par[0]='5';copied.index[0]='18/36';assert.equal(card.par[0],'4');assert.equal(card.index[0],'1');assert.equal(copied.slope,undefined);assert.throws(()=>copyTeeCard({par:[],index:[],metres:[]},'front'),/18 holes/);assert.throws(()=>copyTeeCard({par:Array(18).fill(''),index:Array(18).fill(''),metres:Array(18).fill('')},'front'),/numbers/);
console.log('Passed: independent tee copying, hole values, ratings exclusion and empty source rejection');

assert.throws(()=>acceptedDetails(original,'Course',{}, {middle:{info,included:true,card:{...card,index:card.index.map(x=>x+'/19')}}}),/19 is used twice/);
assert.throws(()=>acceptedDetails(original,'Course',{}, {middle:{info,included:true,card:{...card,index:card.index.map((x,i)=>i===17?'19':x)}}}),/index 1–18/);

const onlyIndex=copyTeeCard(card,'back','index');assert.deepEqual(onlyIndex.index,card.index);assert.equal(onlyIndex.par,undefined);assert.equal(onlyIndex.metres,undefined);onlyIndex.index[0]='9';assert.equal(card.index[0],'1');console.log('Passed: index-only copy preserves other columns and source');
