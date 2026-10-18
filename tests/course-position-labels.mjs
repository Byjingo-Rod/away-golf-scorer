import assert from 'node:assert/strict';
import categories from '../course-categories.js';

const expected={
  1:['Back'],
  2:['Back','Front'],
  3:['Back','Middle','Front'],
  4:['Back','Middle 1','Middle 2','Front'],
  5:['Back','Middle 1','Middle 2','Middle 3','Front'],
};
for(const [count,labels] of Object.entries(expected)){
  const data={teePositionCount:Number(count)};
  assert.deepEqual(categories.positions(data).map(tee=>categories.positionLabel(data,tee)),labels,`${count}-tee labels are wrong`);
}
const singleFront={teePositionCount:1,activeScorecardTee:'front',teeDetails:{front:{name:'Front',colour:'Red'}},teeScorecards:{front:{par:Array(18).fill(4),index:Array.from({length:18},(_,i)=>i+1),metres:Array(18).fill(300)}}};
assert.deepEqual(categories.positions(singleFront),['front'],'a stored single Front tee must not be hidden behind a blank Back tee');
assert.equal(categories.positionLabel(singleFront,'front'),'Front');
console.log('course position label test passed');
