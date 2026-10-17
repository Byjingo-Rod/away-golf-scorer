import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('const BATHURST_CARD_2026 =');
const end=source.indexOf('function applyOfficialBathurstCard',start);
assert(start>=0&&end>start,'Bathurst card data is missing');
const block=source.slice(start,end);
const cards=[['Blue',6065],['Red',5239]];
for(const [colour,total] of cards){
  const match=block.match(new RegExp(`colour:"${colour}"[^\\n]+metres:\\[([^\\]]+)\\]`));
  assert(match,`${colour} card is missing`);
  assert.equal(match[1].split(',').map(Number).reduce((a,b)=>a+b,0),total,`${colour} total is wrong`);
}
assert(block.includes('scratch:"71"'),'Men’s ACR is wrong');
assert(block.includes('scratch:"73"'),'Women’s AWCR is wrong');
assert(source.includes('scorecardAuthorityVersion = "15.95.43-bathurst-v1"'),'Bathurst installation must be one-time');
console.log('Bathurst official card test passed');
