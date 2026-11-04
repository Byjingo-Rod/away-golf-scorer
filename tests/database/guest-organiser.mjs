import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID as uid} from 'node:crypto';
const db=new PGlite({extensions:{pgcrypto}});
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.away_events(id uuid primary key,organiser_id uuid,join_code text,status text,event_data jsonb,updated_at timestamptz default now());
 create table public.away_event_organisers(event_id uuid,user_id uuid,access_type text,revoked_at timestamptz,granted_at timestamptz default now(),primary key(event_id,user_id));
 create table public.away_event_guest_keys(event_id uuid primary key,access_hash text,created_at timestamptz,expires_at timestamptz);`);
 await db.exec(fs.readFileSync(new URL('../guest-functions-before.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../../database/guest-organiser-hardening.sql',import.meta.url),'utf8'));
 const event=uid(),owner=uid(),guest=uid(),other=uid();
 const who=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 const value=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 await db.query("insert into public.away_events values($1,$2,'ABC123','setup','{\"event\":{}}',now())",[event,owner]);
 await who(owner);const code=await value('select public.create_away_guest_organiser_key($1)',[event]);
 await who(guest);
 for(const secret of [null,'','0000000000'])await assert.rejects(()=>value("select public.claim_away_guest_organiser_access('ABC123',$1)",[secret]));
 assert.equal(await value("select public.claim_away_guest_organiser_access('ABC123',$1)",[code]),event);
 assert.equal(await value("select public.claim_away_guest_organiser_access('ABC123',$1)",[code]),event);
 await who(other);await assert.rejects(()=>value("select public.claim_away_guest_organiser_access('ABC123',$1)",[code]));
 await who(guest);await assert.rejects(()=>value('select public.revoke_away_guest_organiser($1)',[event]));
 await who(owner);await value('select public.revoke_away_guest_organiser($1)',[event]);
 await who(guest);await assert.rejects(()=>value("select public.claim_away_guest_organiser_access('ABC123',$1)",[code]));
 for(const name of ['create_away_guest_organiser_key','claim_away_guest_organiser_access','revoke_away_guest_organiser']){
  const definition=await value('select pg_get_functiondef(oid) from pg_proc where proname=$1',[name]);assert.match(definition,/perform 1 from public.away_events .* for update/);
 }
 console.log('Away guest checks passed: missing/wrong codes rejected, one-use claim, same-device retry, replay denied, owner-only revoke and shared event lock for invitation operations.');
}finally{await db.close();}
