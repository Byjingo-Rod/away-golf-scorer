import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('const ASQUITH_CARD_2026 =');
const end=source.indexOf('function applyOfficialAsquithCard',start);
assert(start>=0&&end>start,'Asquith official card data is missing');
const block=source.slice(start,end);

for(const [colour,total] of Object.entries({Blue:5494,White:5210,Red:5037,Yellow:4571})){
  const match=block.match(new RegExp(`colour:"${colour}"[^\\n]+metres:\\[([^\\]]+)\\]`));
  assert(match,`${colour} card is missing`);
  assert.equal(match[1].split(',').map(Number).reduce((a,b)=>a+b,0),total,`${colour} total is wrong`);
}
assert(block.includes('slope:"134",scratch:"70"'),'Men’s Blue rating is wrong');
assert(block.includes('slope:"131",scratch:"68"'),'Men’s White rating is wrong');
assert(block.includes('slope:"137",scratch:"73"'),'Women’s Red rating is wrong');
assert(block.includes('slope:"131",scratch:"70"'),'Women’s Yellow rating is wrong');
assert(source.includes('scorecardAuthorityVersion = "15.95.41-asquith-v1"'),'Asquith installation must be one-time');

console.log('Asquith official card test passed');
