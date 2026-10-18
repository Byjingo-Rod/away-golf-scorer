const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('app.js','utf8');
const start=source.indexOf('  function openAppStorage()'),end=source.indexOf('\n  window.addEventListener("golf-open-storage"',start),body=source.slice(start,end);
assert(start>=0&&end>start);
assert.match(body,/const limited=isPlayerDevice\(\) \|\| isSpectatorDevice\(\)/);
assert.doesNotMatch(body,/if\(isPlayerDevice\(\) \|\| isSpectatorDevice\(\)\)return/);
assert.match(body,/Nothing can be deleted from this player-phone view/);
assert.match(body,/data-storageretry/);
console.log('Passed: warning-banner App Storage opens safely on player phones with retry but no cleanup controls.');
