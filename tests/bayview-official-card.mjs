import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('const BAYVIEW_CARD_2026 =');
const end=source.indexOf('function applyOfficialBayviewCard',start);
assert(start>=0&&end>start,'Bayview official card data is missing');
const block=source.slice(start,end);

for(const [colour,total] of Object.entries({Black:5803,Blue:5582,Red:5368,White:5212,Gold:4976})){
  const match=block.match(new RegExp(`colour:"${colour}"[^\\n]+metres:\\[([^\\]]+)\\]`));
  assert(match,`${colour} card is missing`);
  assert.equal(match[1].split(',').map(Number).reduce((a,b)=>a+b,0),total,`${colour} total is wrong`);
}
const womenIndex=block.match(/women: \{[\s\S]*?index: \[([^\]]+)\]/)?.[1].match(/\d+/g).map(Number);
assert.deepEqual([...womenIndex].sort((a,b)=>a-b),Array.from({length:18},(_,i)=>i+1),"Women’s indexes must contain 1–18 once each");
assert(source.includes('scorecardAuthorityVersion = "15.95.42-bayview-v1"'),'Bayview installation must be one-time');

console.log('Bayview official card test passed');
