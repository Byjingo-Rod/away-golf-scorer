import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema golf_safe_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.away_events(id uuid primary key,organiser_id uuid,name text,status text,event_data jsonb,revision bigint default 1);
 create table public.away_round_scores(event_id uuid,day integer,scorer_player_id text,revision bigint,score_data jsonb);
 create table golf_safe_private.conflicts(event_id uuid);create table golf_safe_private.corrections(event_id uuid);
 create function public.is_away_event_organiser(eid uuid) returns boolean language sql as $$select organiser_id=auth.uid() from public.away_events where id=eid$$;`);
 const funcs=JSON.parse(fs.readFileSync(new URL('../../supabase/schema/production-functions.json',import.meta.url),'utf8')).rows;
 await db.exec(funcs.find(f=>f.function_name==='competition_on').definition);
 await db.exec(fs.readFileSync(new URL('../../database/awarded-results.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../../database/final-history.sql',import.meta.url),'utf8'));
 for(const name of fs.readdirSync(new URL('../../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('_demo_data_isolation.sql')))await db.exec(fs.readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
 const id='00000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',legacy='00000000-0000-4000-8000-000000000004';
 const plan={name:'Synthetic event',date:'2026-01-01',days:1,confirmed:['a'],competitions:['single'],scoringMethods:{day1:'finalStableford'},fullCardDrafts:{unwanted:true},playerHolePos:12,finalResults:{confirmedAt:'accepted',cloudAcceptedAt:'accepted',acceptedScoreRevisions:{'1:a':1},outcomes:{a:['Single Stableford']}}};
 const document={event:plan,players:[{id:'a',name:'Ann Example',golfLink:'private',notes:'unrelated profile'}],courses:[{id:'course',name:'Original card',teeScorecards:{}}],unwantedBackup:{}};
 await db.query("insert into public.away_events values($1,$2,'Synthetic event','complete',$3,1),($4,$2,'Other event','locked',$3,1)",[id,owner,JSON.stringify(document),other]);
 const score={_finalScore:{kind:'stableford',total:36,confirmedAt:'accepted'},_meta:{emergencyFinalised:true}};
 await db.query('insert into public.away_round_scores values($1,1,\'a\',1,$2)',[id,JSON.stringify(score)]);await db.query('insert into golf_safe_private.conflicts values($1)',[id]);
 const snapshot={version:2,eventId:id,signoff:'accepted',rounds:[{day:1,date:'2026-01-01',eligible:true,players:[{id:'a',sourceId:'a',name:'Ann Example',points:36}]}],competitions:[{id:'single-d1',type:'single',label:'Single Stableford',definition:{id:'single-d1',type:'single',day:1},winnerIds:['a'],rows:[{id:'a',total:36,rank:1}],result:{complete:true}}]};
 const finish=(s=snapshot,revision=1)=>(db.query('select public.golf_finish_awarded_event($1,$2,$3) v',[id,JSON.stringify(s),revision])).then(r=>r.rows[0].v);
 await assert.rejects(()=>finish());await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await assert.rejects(()=>finish(snapshot,9));
 for(const mutate of [s=>s.rounds=[],s=>s.rounds[0].players[0].points=99,s=>s.rounds[0].players[0].id='wrong-profile',s=>s.competitions=[],s=>s.competitions[0].winnerIds=[],s=>s.competitions[0].rows[0].total=99]){const invalid=structuredClone(snapshot);mutate(invalid);await assert.rejects(()=>finish(invalid));}
 assert.equal((await db.query('select count(*)::int n from golf_safe_private.conflicts')).rows[0].n,1,'Rejected snapshots remove no working copies');
 const result=await finish();assert(result.finishedAt);assert.equal(result.test,false);assert.equal(result.retentionReceipt.schema,2);assert.equal(result.retentionReceipt.sourceDigest.length,64);assert.deepEqual((await finish()).retentionReceipt,result.retentionReceipt);
 const compact=(await db.query('select event_data from public.away_events where id=$1',[id])).rows[0].event_data;
 assert.equal(compact.event.fullCardDrafts,undefined);assert.equal(compact.event.playerHolePos,undefined);assert.equal(compact.unwantedBackup,undefined);assert.equal(compact.players[0].golfLink,undefined);assert.deepEqual(compact.courses,document.courses);assert.deepEqual(compact.event.finalResults,plan.finalResults);
 assert.deepEqual((await db.query('select score_data from public.away_round_scores where event_id=$1',[id])).rows[0].score_data,score);assert.deepEqual((await db.query('select event_data from public.away_events where id=$1',[other])).rows[0].event_data,document);await assert.rejects(()=>db.query('delete from public.away_events where id=$1',[id]));
 const historical={event:{demonstration:true,date:'2026-01-01',finalResults:{confirmedAt:'old',outcomes:{a:['Original prize']}}},players:[{id:'a',name:'Ann Example'}]};
 await db.query("insert into public.away_events values($1,$2,'Legacy event','archived',$3,1)",[legacy,owner,JSON.stringify(historical)]);await db.query('insert into public.away_round_scores values($1,1,\'a\',1,$2)',[legacy,JSON.stringify(score)]);
 const sealed=(await db.query('select public.golf_finish_awarded_event($1,$2,1) v',[legacy,JSON.stringify({version:2,legacy:true})])).rows[0].v;assert(sealed.legacy);assert.equal(sealed.test,true);assert.equal(sealed.historicalLeaderboardAvailable,false);assert.deepEqual(sealed.originalFinalResults,historical.event.finalResults);assert.deepEqual(sealed.rounds,[]);await assert.rejects(()=>db.query("update public.away_round_scores set score_data='{}' where event_id=$1",[legacy]));
 // Canonical per-hole arithmetic is independent of the supplied snapshot.
 const card={id:'course',teeScorecards:{middle:{par:Array(18).fill(4),index:Array.from({length:18},(_,i)=>(i+1)+'/'+(i+19))}}},p={days:1,competitions:['single'],course1:'course',dailyHandicaps:{day1:{a:0}}},cards={marker:Object.fromEntries(Array.from({length:18},(_,i)=>[i+1,{official:{playerId:'a',gross:4}}]))};
 const points=async()=>(await db.query("select golf_safe_private.awarded_points($1,$2,$3,'a',1) n",[JSON.stringify(p),JSON.stringify([card]),JSON.stringify(cards)])).rows[0].n;
 assert.equal(await points(),36);p.dailyHandicaps.day1.a=54;assert.equal(await points(),90);p.finalResults={confirmedAt:'old'};assert.equal(await points(),72,'Older accepted dual-index rules are preserved');delete p.finalResults;p.dailyHandicaps.day1.a=-4;assert.equal(await points(),32);p.dailyHandicaps.day1.a=0;p.organiserCorrections={day1:{a:{1:{gross:3}}}};assert.equal(await points(),37);delete p.organiserCorrections;cards.marker[1].official.gross='P';assert.equal(await points(),34);
 console.log('Final history rejects missing/tampered snapshots, validates canonical points and original winners, compacts working data, retains emergency cards, freezes legacy outcomes without recalculation and leaves other events unchanged.');
}finally{await db.close();}
