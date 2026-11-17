import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const children=['public.away_event_players','public.away_round_scores','public.away_event_organisers','public.away_event_organiser_keys','public.away_event_guest_keys','public.away_event_spectators','golf_safe_private.conflicts','golf_safe_private.corrections'];
const query=(s,a=[])=>db.query(s,a),value=async(s,a=[])=>Object.values((await query(s,a)).rows[0])[0];
async function role(r,u=''){await db.exec('reset role;set role '+r);await query("select set_config('request.jwt.claim.sub',$1,false)",[u]);}
async function event(name,finished=false){await role('postgres');const id=await value("insert into public.away_events(name,organiser_id,event_data)values($1,$2,$3) returning id",[name,owner,JSON.stringify({event:{name,workspaceId:'workspace-'+name,...(finished?{awardedResults:{finishedAt:'2026-11-17'}}:{})}})]);for(const t of children)await query(`insert into ${t}(event_id)values($1)`,[id]);await role('authenticated',owner);return id;}
const purge=(id,name,revision=1)=>value('select public.away_delete_test_event($1,$2,$3)',[id,name,revision]);
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema golf_safe_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;
 create table public.away_events(id uuid primary key default gen_random_uuid(),organiser_id uuid,name text,event_data jsonb,revision bigint default 1,status text default 'locked');
 create table public.away_organiser_workspaces(owner_id uuid primary key,workspace_data jsonb,revision bigint default 1,updated_at timestamptz default now());`);
 for(const t of children)await db.exec(`create table ${t}(id uuid primary key default gen_random_uuid(),event_id uuid references public.away_events(id) on delete cascade)`);
 for(const migration of fs.readdirSync(new URL('../../supabase/migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())await db.exec(fs.readFileSync(new URL('../../supabase/migrations/'+migration,import.meta.url),'utf8'));
 await db.exec('create trigger awarded_event_guard before update or delete on public.away_events for each row execute function golf_safe_private.guard_awarded_results();');
 const id=await event('TEST – Connection check');
 await assert.rejects(purge(id,'Wrong name'),/exact event name/);await assert.rejects(purge(id,'TEST – Connection check',0),x=>x.code==='PT409');
 await role('anon');await assert.rejects(purge(id,'TEST – Connection check'),x=>x.code==='42501');
 await role('authenticated',other);await assert.rejects(purge(id,'TEST – Connection check'),x=>x.code==='42501');
 await role('postgres');await query('insert into public.away_organiser_workspaces(owner_id,workspace_data)values($1,$2)',[owner,JSON.stringify({players:[{id:'shared-golfer'}],courses:[{id:'shared-course'}],eventWorkspace:[{event:{id:'workspace-TEST – Connection check',name:'TEST – Connection check'},cloud:{eventId:id}},{event:{id:'genuine',name:'Real golf'}}],activePublishedEvent:{eventId:id}})]);
 await role('authenticated',owner);const result=await purge(id,'TEST – Connection check');assert(result.deleted);
 await role('postgres');for(const t of children)assert.equal(await value(`select count(*)::int from ${t} where event_id=$1`,[id]),0);
 await query("update public.away_organiser_workspaces set workspace_data=workspace_data||jsonb_build_object('activePublishedEvent',jsonb_build_object('eventId',$1::text))",[id]);
 const workspace=await value('select workspace_data from public.away_organiser_workspaces');assert.equal(workspace.players.length,1);assert.equal(workspace.courses.length,1);assert.equal(workspace.eventWorkspace.length,1);assert(!JSON.stringify(workspace).includes(id));assert(!JSON.stringify(workspace).includes('Connection check'));
 for(const name of ['TESTING round','Club TEST','DEMO round','Club championship']){const id=await event(name);await assert.rejects(purge(id,name),/first word/);}
 const finished=await event(' test – Awarded ',true);await purge(finished,' test – Awarded ');
 const genuine=await event('Club final',true);await role('postgres');await assert.rejects(query('delete from public.away_events where id=$1',[genuine]),/GOLF_FINISHED/);
 // A failed/stale command leaves its event and capability unchanged.
 const stale=await event('TEST stale');await assert.rejects(purge(stale,'TEST stale',null),x=>x.code==='PT409');
 await role('postgres');assert.equal(await value('select count(*)::int from public.away_events where id=$1',[stale]),1);
 console.log('Away PostgreSQL TEST purge passed: exact names, revisions, ownership, finished TEST results, all eight dependent tables and workspace copies; genuine awarded results preserved.');
}catch(e){console.error(e.message,e.code||'');process.exitCode=1}finally{await db.close()}
