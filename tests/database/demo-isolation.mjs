import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';import assert from 'node:assert/strict';
const db=new PGlite();
try{
 await db.exec("create role anon;create role authenticated;create schema golf_safe_private;");
 const sql=fs.readFileSync(new URL('../../supabase/migrations/20261113045917_demo_data_isolation.sql',import.meta.url),'utf8');
 await db.exec(sql.slice(sql.indexOf('create or replace function golf_safe_private.is_demonstration_event'),sql.indexOf('create or replace function public.golf_finish_awarded_event')));
 const check=async(name,data={})=>(await db.query("select golf_safe_private.is_demonstration_event($1,$2) v",[name,JSON.stringify(data)])).rows[0].v;
 assert.equal(await check('Club round'),false);assert.equal(await check('Latest tournament'),false);
 for(const name of ['DEMO club round','Club TEST round','Demonstration'])assert.equal(await check(name),true);
 for(const event of [{testMode:true},{ridgeTestMode:true},{demonstration:true},{demoBatch:'batch'},{awardedResults:{test:true}}])assert.equal(await check('Renamed',{event}),true);
 assert.equal(await check('Renamed',{players:[{id:'synthetic',demoBatch:'batch'}]}),true);
 assert.equal(await check('Club round',{event:{testMode:false,demonstration:false}}),false);
 await db.exec('set role anon');await assert.rejects(()=>check('DEMO'));
 console.log('Database DEMO classification: names, flags, tagged payloads, retained test flag, real-event negatives and private-function access passed.');
}finally{await db.close();}
