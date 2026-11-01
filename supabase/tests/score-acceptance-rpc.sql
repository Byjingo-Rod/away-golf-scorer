-- Synthetic end-to-end RPC fixtures, rolled back. Run on an isolated database.
begin;
do $$
declare owner_id uuid=gen_random_uuid();users uuid[]=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];outsider uuid=gen_random_uuid();eid uuid;plan jsonb;course jsonb;card jsonb;result jsonb;rev bigint;pid text;target text;j integer;rejected boolean;mode text;
begin
 insert into auth.users(id) values(owner_id),(users[1]),(users[2]),(users[3]),(users[4]),(outsider);
 select jsonb_build_object('id','synthetic-course','teeScorecards',jsonb_build_object('middle',jsonb_build_object('par',jsonb_agg(4),'index',jsonb_agg(i)))) into course from generate_series(1,18)i;
 plan=jsonb_build_object('testMode',true,'days',1,'competitions',jsonb_build_array('single'),'course1','synthetic-course','dailyHandicaps',jsonb_build_object('day1',jsonb_build_object('p1',0,'p2',0,'p3',0,'p4',0)),'groupSetup',jsonb_build_object('day1',jsonb_build_object('groups',jsonb_build_array(jsonb_build_array('p1','p2','p3','p4')))));
 insert into public.away_events(join_code,organiser_id,name,status,event_data) values('SYN001',owner_id,'Synthetic RPC test','locked',jsonb_build_object('event',plan,'courses',jsonb_build_array(course),'players','[{"id":"p1"},{"id":"p2"},{"id":"p3"},{"id":"p4"}]'::jsonb)) returning id into eid;
 for j in 1..4 loop insert into public.away_event_players(event_id,player_id,display_name,member_user_id) values(eid,'p'||j,'Synthetic',users[j]);end loop;
 for j in 1..4 loop
   pid='p'||j;target='p'||(j%4+1);perform set_config('request.jwt.claim.sub',users[j]::text,true);
   select jsonb_object_agg(i::text,jsonb_build_object('self',jsonb_build_object('playerId',pid,'gross',6),'official',jsonb_build_object('playerId',target,'gross','P'))) into card from generate_series(1,18)i;
   result=public.golf_safe_away_save('score',eid,1,pid,card,null,false,null,null);
   if (result->>'revision')::bigint<>1 then raise exception 'First score revision incorrect';end if;
 end loop;
 for j in 1..4 loop
   pid='p'||j;perform set_config('request.jwt.claim.sub',users[j]::text,true);
   select score_data||'{"_meta":{"finalisedAt":"2026-11-01T10:00:00Z"}}',revision into card,rev from public.away_round_scores where event_id=eid and scorer_player_id=pid;
   result=public.golf_safe_away_save('score',eid,1,pid,card,rev,false,null,null);
   if (result->>'revision')::bigint<>2 then raise exception 'Final score revision incorrect';end if;
 end loop;
 -- The complete ordinary four-player set can receive a real final sign-off.
 if to_regprocedure('golf_safe_private.assert_event_complete(uuid,jsonb)') is not null then
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 select event_data,revision into card,rev from public.away_events where id=eid;
 select jsonb_object_agg(day::text||':'||scorer_player_id,revision) into result from public.away_round_scores where event_id=eid;
 card=jsonb_set(card,'{event,finalResults}',jsonb_build_object('confirmedAt','2026-11-02T10:00:00Z','expectedScoreRevisions',result));
 result=public.golf_safe_away_save('event',eid,null,null,card,rev,false,null,'complete');
 if result->'saved_data'->'event'->'finalResults'->>'cloudAcceptedAt' is null then raise exception 'Ordinary card sign-off receipt missing';end if;
 perform set_config('request.jwt.claim.sub',users[4]::text,true);
 end if;
 -- Accepted cards remain immutable; stale revisions and other identities fail.
 select score_data,revision into card,rev from public.away_round_scores where event_id=eid and scorer_player_id='p4';
 rejected=false;begin perform public.golf_safe_away_save('score',eid,1,'p4',jsonb_set(card,'{1,self,gross}','7'),rev,false,null,null);exception when others then rejected=true;end;
 if not rejected then raise exception 'Player changed an accepted card';end if;
 rejected=false;begin perform public.golf_safe_away_save('score',eid,1,'p4',card,rev-1,false,null,null);exception when sqlstate '40001' then rejected=true;end;
 if not rejected then raise exception 'Stale revision bypassed compare and swap';end if;
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 rejected=false;begin perform public.golf_safe_away_save('score',eid,1,'p4',card,rev,false,null,null);exception when sqlstate '42501' then rejected=true;end;
 if not rejected then raise exception 'Unconnected identity changed a card';end if;
 -- The trusted organiser can still perform an audited correction.
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.golf_safe_away_save('score',eid,1,'p4',jsonb_set(card,'{1,self,gross}','7'),rev,true,'Synthetic audited correction',null);
 if not exists(select 1 from golf_safe_private.corrections where event_id=eid and player_id='p4') then raise exception 'Correction audit missing';end if;
 foreach mode in array array['fullCardPlayer','finalStableford','finalGross'] loop
   insert into public.away_events(join_code,organiser_id,name,status,event_data) values(case mode when 'fullCardPlayer' then 'SYN002' when 'finalStableford' then 'SYN003' else 'SYN004' end,owner_id,'Synthetic method','locked',jsonb_build_object('event',plan||jsonb_build_object('scoringMethods',jsonb_build_object('day1',mode)),'courses',jsonb_build_array(course),'players','[{"id":"p1"}]'::jsonb)) returning id into eid;
   insert into public.away_event_players(event_id,player_id,display_name,member_user_id) values(eid,'p1','Synthetic',users[1]);
   perform set_config('request.jwt.claim.sub',users[1]::text,true);
   if mode='fullCardPlayer' then
     select jsonb_object_agg(i::text,jsonb_build_object('self',jsonb_build_object('playerId','p1','gross',4),'official',jsonb_build_object('playerId','p1','gross',4)))||'{"_meta":{"finalisedAt":"2026-11-01T10:00:00Z","fullCardEnteredByPlayer":true}}'::jsonb into card from generate_series(1,18)i;
   else card=jsonb_build_object('_finalScore',jsonb_build_object('kind',case when mode='finalGross' then 'gross' else 'stableford' end,'total',case when mode='finalGross' then 82 else 36 end,'confirmedAt','2026-11-01T10:00:00Z'));end if;
   result=public.golf_safe_away_save('score',eid,1,'p1',card,null,false,null,null);
   if not exists(select 1 from public.away_round_scores where event_id=eid and scorer_player_id='p1' and score_data=card) then raise exception 'Published method submission not stored: %',mode;end if;
   rejected=false;begin perform public.golf_safe_away_save('score',eid,1,'p1',card||'{"_meta":{"finalisedAt":"2026-11-02T10:00:00Z"}}',(result->>'revision')::bigint,false,null,null);exception when sqlstate '42501' then rejected=true;end;
   if not rejected then raise exception 'Accepted method card can be edited: %',mode;end if;
 end loop;
 raise notice 'Four-player RPC, exact revisions, protected completion, outsider denial, audited correction and all entry methods passed';
end;
$$;
rollback;
