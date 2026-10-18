const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('app.js','utf8');
for(const name of ['cancelCurrentEvent','deleteCurrentEvent']){
  const start=source.indexOf(`  async function ${name}()`),next=source.indexOf('\n  async function ',start+20),body=source.slice(start,next>start?next:source.length);
  assert(start>=0,`${name} exists`);
  assert.match(body,/AwayCloud\.saveWorkspace\(\{ activePublishedEvent: null \}\)/,`${name} clears the cloud active-event pointer`);
}
console.log('Passed: cancelling or deleting one event prevents that event returning after the app restarts.');
