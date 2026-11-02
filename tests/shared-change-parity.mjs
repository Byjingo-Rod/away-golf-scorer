import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const pins=JSON.parse(fs.readFileSync('docs/SHARED_CHANGE_HASHES.json','utf8'));
for(const path of ['app.js',...(fs.existsSync('dist/golf-event-scorer/app.js')?['dist/golf-event-scorer/app.js']:[])]){
 const source=fs.readFileSync(path,'utf8');
 for(const [name,digest] of Object.entries(pins)){
  const start=source.indexOf('  function '+name+'(');assert(start>=0,name);
  const end=source.indexOf('\n  }',start)+4;
  assert.equal(crypto.createHash('sha256').update(source.slice(start,end)).digest('hex'),digest,path+' shared function '+name);
 }
 assert(source.includes('includes ONLY players with a daily handicap of ${max} or less.'));
}
assert(fs.readFileSync('styles.css','utf8').includes('.scratchLimitBox .scratchScoringMode label'));
console.log('Shared change parity passed: GA draw, profile merge and Scratch wording match pinned cross-app changes.');
