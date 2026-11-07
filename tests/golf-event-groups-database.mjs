import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db = new PGlite();
const owner='11111111-1111-4111-8111-111111111111', alice='22222222-2222-4222-8222-222222222222', bob='33333333-3333-4333-8333-333333333333', stranger='44444444-4444-4444-8444-444444444444', anonymous='55555555-5555-4555-8555-555555555555';
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key, email text unique, email_confirmed_at timestamptz, is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
insert into auth.users values
('${owner}', 'rod@example.test', now(),false),
('${alice}', 'alice@example.test', now(),false),
('${bob}', 'bob@example.test', now(),false),
('${stranger}', 'stranger@example.test', now(),false),
('${anonymous}', null, null,true);
`);
await db.exec(readFileSync(new URL('../products/golf-event-scorer-database.sql',import.meta.url),'utf8'));
await db.query('insert into public.ges_owners values ($1)',[owner]);
async function as(user,role='authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user || '']);
  await db.exec('set role ' + role);
}
async function scalar(sql, args=[]) {const r=await db.query(sql,args); return Object.values(r.rows[0])[0];}
async function denied(sql,args=[],pattern=/denied|permission|Owner approval/i) {await assert.rejects(db.query(sql,args),pattern);}
await as(owner);
const a=await scalar("select public.ges_create_group('Oatlands Monthly Group')");
const b=await scalar("select public.ges_create_group('Another Group')");
await scalar('select public.ges_approve_organiser($1,$2)',[a,'ALICE@example.test']);
await scalar('select public.ges_approve_organiser($1,$2)',[b,'bob@example.test']);
assert.equal((await db.query('select * from public.ges_list_organisers($1)',[a])).rows[0].email,'alice@example.test');
await as(alice);
assert.deepEqual((await db.query('select id from public.ges_groups')).rows.map(r=>r.id),[a]);
await denied("select public.ges_create_group('Unauthorised')");
await denied('select public.ges_approve_organiser($1,$2)',[a,'stranger@example.test']);
await denied('select public.ges_list_organisers($1)',[b]);
await denied('insert into public.ges_owners values ($1)',[alice]);
await denied('update public.ges_organisers set enabled=true');
const p=await scalar('select public.ges_save_player($1,$2,$3)',[a,'Sam',-4]);
await denied('select public.ges_save_player($1,$2,$3)',[b,'Intruder',0]);
const event=await scalar('select public.ges_create_event($1,$2,$3,$4)',[a,'October Golf','2026-10-20',20]);
const args=[event,1,'October Golf','2026-10-20',20,{notes:'First save',teams:['team1']}];
assert.equal(Number(await scalar('select public.ges_save_event($1,$2,$3,$4,$5,$6)',args)),2);
await denied('select public.ges_save_event($1,$2,$3,$4,$5,$6)',args,/changed on another device/);
assert.equal((await db.query('select planning_data from public.ges_events where id=$1',[event])).rows[0].planning_data.notes,'First save');
await denied('update public.ges_events set group_id=$1 where id=$2',[b,event]);
await as(bob);
assert.equal((await db.query('select * from public.ges_events where id=$1',[event])).rows.length,0);
assert.equal((await db.query('select * from public.ges_players where id=$1',[p])).rows.length,0);
await denied('select public.ges_save_event($1,$2,$3,$4,$5,$6)',[...args.slice(0,1),2,...args.slice(2)]);
await denied('select public.ges_save_player($1,$2,$3,$4,$5)',[b,'Cross-group update',1,p,1],/changed on another device/);
await as(stranger);
assert.equal((await db.query('select * from public.ges_groups')).rows.length,0);
await denied('select public.ges_create_event($1,$2,$3,$4)',[a,'Unapproved','2026-10-20',20]);
await as(anonymous);
assert.equal(await scalar('select public.ges_can_access($1)',[a]),false);
await denied('select public.ges_create_event($1,$2,$3,$4)',[a,'Anonymous','2026-10-20',20]);
await as(null,'anon');
await denied('select * from public.ges_players');
await denied('select public.ges_is_owner()');
await as(owner);
await scalar('select public.ges_set_organiser_enabled($1,$2,$3)',[a,alice,false]);
await as(alice);
assert.equal((await db.query('select * from public.ges_events')).rows.length,0);
await denied('select public.ges_save_player($1,$2,$3)',[a,'Suspended',0]);
await as(owner);
assert.equal((await db.query('select * from public.ges_events')).rows.length,1);
await scalar('select public.ges_set_organiser_enabled($1,$2,$3)',[a,alice,true]);
await scalar('select public.ges_set_group_enabled($1,$2)',[a,false]);
await as(alice);
assert.equal((await db.query('select * from public.ges_players')).rows.length,0);
await denied('select public.ges_create_event($1,$2,$3,$4)',[a,'Suspended group','2026-10-20',20]);
await as(owner);
await scalar('select public.ges_set_group_enabled($1,$2)',[a,true]);
await as(alice);
assert.equal((await db.query('select * from public.ges_players')).rows.length,1);
await denied('select public.ges_create_event($1,$2,$3,$4)',[a,'Invalid size','2026-10-20',61],/check constraint/);
await denied('select public.ges_save_player($1,$2,$3)',[a,'Invalid handicap',100],/check constraint/);
await db.exec('reset role');
await db.query("update public.ges_events set status='complete', results_data=$1 where id=$2",[{winner:'Sam'},event]);
await as(alice);
await denied('select public.ges_save_event($1,$2,$3,$4,$5,$6)',[event,2,...args.slice(2)],/read-only/);
assert.equal((await db.query('select results_data from public.ges_events')).rows[0].results_data.winner,'Sam');
await db.close();
console.log('Group database checks passed: owner-only grants, isolated records, suspension, revision conflicts, validation and read-only results.');
