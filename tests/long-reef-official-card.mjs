import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('const LONG_REEF_CARD_2026 =');
const end=source.indexOf('function applyOfficialLongReefCard',start);
assert(start>=0&&end>start,'Long Reef official card data is missing');
const block=source.slice(start,end);

for(const [tee,total] of Object.entries({
  back:5955,
  middle:5782,
  front:5498,
  tee4:4943,
})){
  const match=block.match(new RegExp(`${tee}: \\{colour:[^\\n]+metres:\\[([^\\]]+)\\]`));
  assert(match,`Men’s ${tee} card is missing`);
  assert.equal(match[1].split(',').map(Number).reduce((a,b)=>a+b,0),total,`Men’s ${tee} total is wrong`);
}
const red=block.match(/back: \{colour:"Red"[^\n]+metres:\[([^\]]+)\]/);
assert(red,'Women’s Red card is missing');
assert.equal(red[1].split(',').map(Number).reduce((a,b)=>a+b,0),5303,'Women’s Red total is wrong');
assert(source.includes('localStorage.setItem(draftKey, JSON.stringify(draft))'),'saved Long Reef editor draft must be updated');
assert(source.includes('scorecardAuthorityVersion = "15.95.40-long-reef-v1"'),'Long Reef installation must be one-time');

console.log('Long Reef official card test passed');
