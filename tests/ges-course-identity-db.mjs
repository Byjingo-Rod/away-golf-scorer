import fs from 'node:fs';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {PGlite}=createRequire(new URL('./database/package.json',import.meta.url))('@electric-sql/pglite');
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema ges_private;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.ges_groups(id uuid primary key,enabled boolean,setup_status text,archived_at timestamptz);
 create table public.ges_organisers(group_id uuid,user_id uuid,enabled boolean,approved_at timestamptz);
 create table public.synthetic_owners(user_id uuid);
 create function public.ges_is_owner() returns boolean language sql stable as $$select exists(select 1 from public.synthetic_owners where user_id=auth.uid())$$;
 create function ges_private.ready_course_ids(gid uuid) returns text[] language sql stable as $$select array['away-c1']::text[]$$;`);
 await db.exec(fs.readFileSync(new URL('../supabase/companion/ges-course-master-identity.sql',import.meta.url),'utf8'));
 const u='10000000-0000-0000-0000-000000000001',g='20000000-0000-0000-0000-000000000001';
 await db.exec(`insert into auth.users values('${u}',now(),false);insert into public.ges_groups values('${g}',true,'active',null);select set_config('request.jwt.claim.sub','${u}',false);`);
 const identity=async()=>(await db.query('select public.ges_course_master_identity() as identity')).rows[0].identity;
 assert.equal((await identity()).editor,false,'verified email alone is not approval');
 await db.exec(`insert into public.ges_organisers values('${g}','${u}',true,now());`);
 assert.deepEqual(await identity(),{owner:false,editor:true,courseIds:['away-c1']});
 for(const change of ["update public.ges_organisers set enabled=false","update public.ges_groups set enabled=false","update public.ges_groups set setup_status='pending_review'","update public.ges_groups set archived_at=now()","update auth.users set is_anonymous=true"]){
   await db.exec('begin;'+change+';');assert.equal((await identity()).editor,false);await db.exec('rollback;');
 }
 await db.exec(`insert into public.synthetic_owners values('${u}');`);assert.equal((await identity()).owner,true);
 assert.equal((await db.query("select has_function_privilege('anon','public.ges_course_master_identity()','EXECUTE') as allowed")).rows[0].allowed,false);
 console.log('Passed: isolated SQL checks for confirmed/unapproved, approved, suspended, inactive, archived, anonymous and owner course identities.');
}finally{await db.close();}
