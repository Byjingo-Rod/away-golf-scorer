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
console.log('course position label test passed');
