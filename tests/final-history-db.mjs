import {spawnSync} from 'node:child_process';
const r=spawnSync(process.execPath,['--input-type=module','-e',"import('./tests/database/final-history.mjs').catch(e=>{console.error(e.message,e.where||'');process.exitCode=1})"],{encoding:'utf8'});
process.stdout.write(r.stdout);process.stderr.write(r.stderr);if(r.status!==0)process.exit(r.status||1);
