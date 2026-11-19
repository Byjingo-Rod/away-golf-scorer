import fs from 'node:fs';
const source=fs.readFileSync(new URL('../matchplay-model.mjs',import.meta.url),'utf8');
const names=[...source.matchAll(/export (?:function|const|let)\s+(\w+)/g)].map(match=>match[1]);
fs.writeFileSync(new URL('../matchplay-core.js',import.meta.url),'// Generated from matchplay-model.mjs; keep the shared model as the source.\n(function(){\n'+source.replaceAll('export ','')+'\nwindow.GolfMatchplay={'+names.join(',')+'};\n})();\n');
