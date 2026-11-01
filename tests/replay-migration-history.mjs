// PostgreSQL replay with real pgcrypto and explicit local shims for Supabase's
// Auth, Realtime publication and retired pg_net/pg_cron platform integrations.
// No HTTP requests are sent. This is not a hosted Supabase disaster-recovery drill.
import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(new URL('./database/package.json',import.meta.url));
const {PGlite}=require('@electric-sql/pglite'),{pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const db=new PGlite({extensions:{pgcrypto}}),root=new URL('../',import.meta.url);
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_admin;
 create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
 create table auth.users(id uuid primary key default gen_random_uuid(),email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub',auth.uid(),'role',auth.role())$$;
 grant usage on schema public,auth,extensions to anon,authenticated,service_role;
 alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
 create publication supabase_realtime;
 insert into auth.users(email,email_confirmed_at,is_anonymous) values('synthetic-owner@example.invalid',now(),false);
 set away.course_owner_email='synthetic-owner@example.invalid';set away.rebuild_mode='fresh';
 create schema cron;create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text,active boolean default true);
 create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid$$;
 create function cron.unschedule(bigint) returns boolean language sql as $$with removed as(delete from cron.job where jobid=$1 returning jobid) select exists(select 1 from removed)$$;
 create schema net;create table net._http_response(id bigint,status_code integer,content text);
 create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 5000) returns bigint language sql as $$select 1::bigint$$;`);
 const names=fs.readdirSync(new URL('supabase/migrations/',root)).filter(n=>n.endsWith('.sql')).sort();
 for(const name of names){
   let sql=fs.readFileSync(new URL('supabase/migrations/'+name,root),'utf8');
   sql=sql.replace(/create extension if not exists pg_(?:net|cron);/gi,'-- Platform extension supplied by an explicit local test shim.');
   try{await db.exec(sql);}catch(error){throw new Error(name+': '+error.message+' '+(error.where||''));}
 }
 await db.exec(fs.readFileSync(new URL('supabase/tests/verify-production-schema.sql',root),'utf8'));
 await db.exec(fs.readFileSync(new URL('supabase/tests/score-acceptance.sql',root),'utf8'));
 await db.exec(fs.readFileSync(new URL('supabase/tests/score-acceptance-rpc.sql',root),'utf8'));
 await db.exec(fs.readFileSync(new URL('supabase/tests/archive-retention.sql',root),'utf8'));
 console.log('Passed: ordered replay of '+names.length+' migrations, schema checks and scoring validators in isolated PostgreSQL (pg_net/cron are local platform shims).');
}catch(error){console.error('Migration replay failed:',error.message);process.exitCode=1;}finally{await db.close();}
