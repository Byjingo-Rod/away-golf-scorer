-- Disposable PostgreSQL fixtures only. Never run on production.
begin;
do $$
declare owner_id uuid=gen_random_uuid();guest uuid=gen_random_uuid();u1 uuid=gen_random_uuid();u2 uuid=gen_random_uuid();u3 uuid=gen_random_uuid();u4 uuid=gen_random_uuid();j integer;eid uuid;eid2 uuid;code text;key text;p jsonb;doc jsonb;r jsonb;card jsonb;other_card jsonb;rev bigint;cardrev bigint;revisions jsonb;rejected boolean;mode text;pid text;d integer;archived_result jsonb;
begin
 insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(owner_id,'lifecycle@example.invalid',now(),false),(guest,'guest@example.invalid',now(),false),(u1,null,null,true),(u2,null,null,true),(u3,null,null,true),(u4,null,null,true);
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 p='{"publicationId":"synthetic-lifecycle-operation","days":1,"fieldSize":4,"locked":true,"date":"2080-01-01","timeZone":"Australia/Sydney","startTimes":{"day1":["09:00"]},"confirmed":["p1","p2","p3","p4"],"competitions":["single"],"groupSetup":{"day1":{"groups":[["p1","p2","p3","p4"]]}}}';
 doc=jsonb_build_object('event',p,'players','[{"id":"p1","name":"One"},{"id":"p2","name":"Two"},{"id":"p3","name":"Three"},{"id":"p4","name":"Four"}]'::jsonb,'courses','[]'::jsonb);
 select event_id,join_code into eid,code from public.create_away_event('Synthetic lifecycle',doc,doc->'players');
 select event_id into eid2 from public.create_away_event('Retry same operation',doc,doc->'players');
 if eid<>eid2 or (select count(*) from public.away_events where organiser_id=owner_id and event_data->'event'->>'publicationId'=p->>'publicationId')<>1 then raise exception 'Publication was not idempotent';end if;
 select revision into rev from public.away_events where id=eid;
 perform public.golf_safe_away_save('event',eid,null,null,doc,rev,false,null,'locked');
 perform set_config('request.jwt.claim.sub',u1::text,true);perform public.join_away_event(code,'p1');
 rejected=false;begin perform public.golf_safe_away_save('score',eid,1,'p1','{"1":{"self":{"gross":4,"playerId":"p1"},"official":{"gross":4,"playerId":"p2"}}}',null,false,null,null);exception when sqlstate '42501' then rejected=true;end;
 if not rejected then raise exception 'Future scoring gate bypass';end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);select revision into rev from public.away_events where id=eid;
 doc=jsonb_set(doc,'{event,scoringOpenedEarly}','{"day1":true}');perform public.golf_safe_away_save('event',eid,null,null,doc,rev,false,null,'locked');
 perform set_config('request.jwt.claim.sub',u1::text,true);perform public.golf_safe_away_save('score',eid,1,'p1','{"1":{"self":{"gross":4,"playerId":"p1"},"official":{"gross":4,"playerId":"p2"}}}',null,false,null,null);
 -- A final sign-off cannot cover incomplete cards, even for the organiser.
 perform set_config('request.jwt.claim.sub',owner_id::text,true);select revision into rev from public.away_events where id=eid;
 rejected=false;begin perform public.golf_safe_away_save('event',eid,null,null,jsonb_set(doc,'{event,finalResults}','{"confirmedAt":"2026-11-02T01:00:00Z","expectedScoreRevisions":{}}'),rev,false,null,'complete');exception when others then rejected=true;end;
 if not rejected then raise exception 'Incomplete event closed';end if;
 -- Ambrose role, drive, counterpart, acknowledgement and close checks.
 foreach mode in array array['scorerOnly','scorerMarker'] loop
  p=jsonb_build_object('publicationId','synthetic-'||mode,'days',1,'fieldSize',3,'locked',true,'testMode',true,'competitions','["ambrose"]'::jsonb,'ambroseMinimumDrives',2,'ambroseScoringMode',mode,'confirmed','["p1","p2","p3"]'::jsonb,'ambroseRoleAssignments','{"day1":{"0":{"scorerId":"p2","markerId":"p1"}}}'::jsonb,'groupSetup','{"day1":{"groups":[["p1","p2","p3"]]}}'::jsonb);
  doc=jsonb_build_object('event',p,'players','[{"id":"p1"},{"id":"p2"},{"id":"p3"}]'::jsonb,'courses','[]'::jsonb);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);select event_id,join_code into eid,code from public.create_away_event('Synthetic Ambrose',doc,doc->'players');select revision into rev from public.away_events where id=eid;perform public.golf_safe_away_save('event',eid,null,null,doc,rev,false,null,'locked');
  key=public.create_away_guest_organiser_key(eid);perform set_config('request.jwt.claim.sub',guest::text,true);perform public.claim_away_guest_organiser_access(code,key);
  perform set_config('request.jwt.claim.sub',u1::text,true);perform public.join_away_event(code,'p1');perform set_config('request.jwt.claim.sub',u2::text,true);perform public.join_away_event(code,'p2');perform set_config('request.jwt.claim.sub',u3::text,true);perform public.join_away_event(code,'p3');
  select jsonb_object_agg(h::text,jsonb_build_object('self',jsonb_build_object('playerId','p3','gross',4),'ambrose',jsonb_build_object('drivePlayerId','p'||(h%3+1)))) into card from generate_series(1,18)h;
  rejected=false;begin perform public.golf_safe_away_save('score',eid,1,'p3',card,null,false,null,null);exception when sqlstate '42501' then rejected=true;end;if not rejected then raise exception 'Non-scorer submitted Ambrose';end if;
  select jsonb_object_agg(h::text,jsonb_build_object('self',jsonb_build_object('playerId','p2','gross',4),'ambrose',jsonb_build_object('drivePlayerId','p'||(h%3+1)))) into card from generate_series(1,18)h;
  perform set_config('request.jwt.claim.sub',u2::text,true);
  rejected=false;begin perform public.golf_safe_away_save('score',eid,1,'p2',jsonb_set(card,'{1,ambrose,drivePlayerId}','"outside"'),null,false,null,null);exception when others then rejected=true;end;if not rejected then raise exception 'Out-of-team drive accepted';end if;
  if mode='scorerMarker' then
   rejected=false;begin perform public.golf_safe_away_save('score',eid,1,'p2',card||'{"_meta":{"finalisedAt":"2026-11-02T01:00:00Z","ambroseDriveCompliant":true}}',null,false,null,null);exception when others then rejected=true;end;if not rejected then raise exception 'Missing marker accepted';end if;
   select jsonb_object_agg(h::text,jsonb_build_object('self',jsonb_build_object('playerId','p1','gross',4),'ambrose',jsonb_build_object('drivePlayerId','p'||(h%3+1)))) into other_card from generate_series(1,18)h;
   perform set_config('request.jwt.claim.sub',u1::text,true);perform public.golf_safe_away_save('score',eid,1,'p1',other_card,null,false,null,null);
  end if;
  perform set_config('request.jwt.claim.sub',u2::text,true);
  rejected=false;begin perform public.golf_safe_away_save('score',eid,1,'p2',card||'{"_meta":{"finalisedAt":"2026-11-02T01:00:00Z","ambroseDriveCompliant":false}}',null,false,null,null);exception when others then rejected=true;end;if not rejected then raise exception 'Fabricated compliance accepted';end if;
  perform public.golf_safe_away_save('score',eid,1,'p2',card||'{"_meta":{"finalisedAt":"2026-11-02T01:00:00Z","ambroseDriveCompliant":true}}',null,false,null,null);
  if mode='scorerMarker' then
   perform set_config('request.jwt.claim.sub',u1::text,true);
   rejected=false;begin perform public.golf_safe_away_save('score',eid,1,'p1',jsonb_set(other_card,'{1,self,gross}','5'),1,false,null,null);exception when sqlstate '42501' then rejected=true;end;if not rejected then raise exception 'Accepted counterpart edited';end if;
   perform public.golf_safe_away_save('score',eid,1,'p1',other_card||'{"_meta":{"finalisedAt":"2026-11-02T01:01:00Z","ambroseDriveCompliant":true}}',1,false,null,null);
  end if;
  perform set_config('request.jwt.claim.sub',guest::text,true);
  select revision into rev from public.away_events where id=eid;
  doc=jsonb_set(doc,'{event,finalResults}','{"confirmedAt":"2026-11-02T01:02:00Z","expectedScoreRevisions":{}}');
  rejected=false;begin perform public.golf_safe_away_save('event',eid,null,null,doc,rev,false,null,'complete');exception when sqlstate '40001' then rejected=true;end;if not rejected then raise exception 'Stale score sign-off accepted';end if;
  select jsonb_object_agg(day::text||':'||scorer_player_id,revision) into revisions from public.away_round_scores where event_id=eid;
  doc=jsonb_set(doc,'{event,finalResults,expectedScoreRevisions}',revisions);
  insert into golf_safe_private.conflicts(event_id,kind,local_data,remote_data) values(eid,'score','{}','{}');
  rejected=false;begin perform public.golf_safe_away_save('event',eid,null,null,doc,rev,false,null,'complete');exception when others then rejected=true;end;if not rejected then raise exception 'Unresolved review signed off';end if;
  delete from golf_safe_private.conflicts where event_id=eid;
  r=public.golf_safe_away_save('event',eid,null,null,doc,rev,false,null,'complete');doc=r->'saved_data';
  if doc->'event'->'finalResults'->>'cloudAcceptedAt' is null or doc->'event'->'finalResults'->>'confirmedBy'<>guest::text or doc->'event'->'finalResults'->'acceptedScoreRevisions'<>revisions then raise exception 'Final receipt incomplete';end if;
  if (select status from public.away_events where id=eid)<>'complete' or public.is_away_event_organiser(eid) then raise exception 'Close did not revoke guest';end if;
  rejected=false;begin perform public.golf_safe_away_save('event',eid,null,null,doc,(r->>'revision')::bigint,false,null,'complete');exception when sqlstate '42501' then rejected=true;end;if not rejected then raise exception 'Former guest still writes';end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if not public.is_away_event_organiser(eid) then raise exception 'Owner lost authority';end if;
  select score_data,revision into card,cardrev from public.away_round_scores where event_id=eid and scorer_player_id='p2';
  perform public.golf_safe_away_save('score',eid,1,'p2',jsonb_set(card,'{1,self,gross}','5'),cardrev,true,'Synthetic result correction',null);
  if (select event_data->'event'->'finalResults' from public.away_events where id=eid) is not null then raise exception 'Correction retained stale sign-off';end if;
  select revision into rev from public.away_events where id=eid;
  rejected=false;begin perform public.golf_safe_away_save('event',eid,null,null,doc,rev,false,null,'complete');exception when others then rejected=true;end;if not rejected then raise exception 'Old sign-off resurrected';end if;
 end loop;
 -- A genuinely non-compliant scorer-only team can submit and close without a winner.
 p='{"publicationId":"synthetic-noncompliant","days":1,"fieldSize":3,"locked":true,"testMode":true,"competitions":["ambrose"],"ambroseMinimumDrives":4,"ambroseScoringMode":"scorerOnly","ambroseRoleAssignments":{"day1":{"0":{"scorerId":"p2"}}},"groupSetup":{"day1":{"groups":[["p1","p2","p3"]]}}}';
 doc=jsonb_build_object('event',p,'players','[{"id":"p1"},{"id":"p2"},{"id":"p3"}]'::jsonb,'courses','[]'::jsonb);
 perform set_config('request.jwt.claim.sub',owner_id::text,true);select event_id,join_code into eid,code from public.create_away_event('Synthetic excluded team',doc,doc->'players');select revision into rev from public.away_events where id=eid;perform public.golf_safe_away_save('event',eid,null,null,doc,rev,false,null,'locked');
 perform set_config('request.jwt.claim.sub',u2::text,true);perform public.join_away_event(code,'p2');select jsonb_object_agg(h::text,jsonb_build_object('self',jsonb_build_object('playerId','p2','gross',4),'ambrose',jsonb_build_object('drivePlayerId','p2')))||'{"_meta":{"finalisedAt":"2026-11-02T01:00:00Z","ambroseDriveCompliant":false}}'::jsonb into card from generate_series(1,18)h;perform public.golf_safe_away_save('score',eid,1,'p2',card,null,false,null,null);
 perform set_config('request.jwt.claim.sub',owner_id::text,true);select revision into rev from public.away_events where id=eid;select jsonb_object_agg(day::text||':'||scorer_player_id,revision) into revisions from public.away_round_scores where event_id=eid;
 doc=jsonb_set(doc,'{event,finalResults}',jsonb_build_object('confirmedAt','2026-11-02T02:00:00Z','expectedScoreRevisions',revisions));perform public.golf_safe_away_save('event',eid,null,null,doc,rev,false,null,'complete');
 -- Final-total entry locks only the affected round, including substitutions.
 p='{"publicationId":"synthetic-final-total","days":2,"fieldSize":4,"locked":true,"testMode":true,"confirmed":["p1","p2","p3","p4"],"competitions":["stroke"],"scoringMethods":{"day1":"finalGross","day2":"finalGross"},"groupSetup":{"day1":{"groups":[["p1","p2","p3","p4"]]},"day2":{"groups":[["p1","p2","p3","p4"]]}}}';
 doc=jsonb_build_object('event',p,'players','[{"id":"p1"},{"id":"p2"},{"id":"p3"},{"id":"p4"}]'::jsonb,'courses','[]'::jsonb);
 select event_id,join_code into eid,code from public.create_away_event('Synthetic final-total locks',doc,doc->'players');select revision into rev from public.away_events where id=eid;perform public.golf_safe_away_save('event',eid,null,null,doc,rev,false,null,'locked');
 perform set_config('request.jwt.claim.sub',u1::text,true);perform public.join_away_event(code,'p1');perform public.golf_safe_away_save('score',eid,1,'p1','{"_finalScore":{"kind":"gross","total":82,"confirmedAt":"2026-11-02T01:00:00Z"}}',null,false,null,null);
 perform set_config('request.jwt.claim.sub',owner_id::text,true);select revision into rev from public.away_events where id=eid;
 rejected=false;begin perform public.golf_safe_away_save('event',eid,null,null,jsonb_set(doc,'{event,dailyHandicaps}','{"day1":{"p1":12}}'),rev,false,null,'locked');exception when sqlstate '42501' then rejected=true;end;if not rejected then raise exception 'Final total handicap lock bypass';end if;
 rejected=false;begin perform public.golf_safe_away_save('event',eid,null,null,jsonb_set(doc,'{event,playerSubstitutions}','{"p1":[{"fromDay":1,"replacement":{"id":"new-player","name":"Synthetic Replacement","ga":10}}]}'),rev,false,null,'locked');exception when others then rejected=true;end;if not rejected then raise exception 'Final-total substitute allowed';end if;
 perform public.golf_safe_away_save('event',eid,null,null,jsonb_set(doc,'{event,dailyHandicaps}','{"day2":{"p1":12}}'),rev,false,null,'locked');
 -- Confirmed paper cards are supported, and changing them revokes old sign-off.
 doc=jsonb_set(doc,'{event,publicationId}','"synthetic-paper-close"');doc=jsonb_set(doc,'{event,days}','1');doc=jsonb_set(doc,'{event,manualScorecards}','{"day1":{"groups":{"0":{"source":"paper-team-card","playerIds":["p1","p2","p3","p4"],"status":"submitted","submittedAt":"2026-11-02T01:00:00Z","players":{"p1":{"single":{"total":36}},"p2":{"single":{"total":34}},"p3":{"single":{"total":30}},"p4":{"single":{"total":29}}},"team":{}}}}}');
 select event_id into eid from public.create_away_event('Synthetic paper close',doc,doc->'players');select revision into rev from public.away_events where id=eid;
 doc=jsonb_set(doc,'{event,finalResults}','{"confirmedAt":"2026-11-02T02:00:00Z","expectedScoreRevisions":{}}');r=public.golf_safe_away_save('event',eid,null,null,doc,rev,false,null,'complete');doc=r->'saved_data';
 r=public.golf_safe_away_save('event',eid,null,null,jsonb_set(doc,'{event,manualScorecards,day1,groups,0,players,p1,single,total}','37'),(r->>'revision')::bigint,false,null,'complete');
 if r->'saved_data'->'event'->'finalResults' is not null or (select status from public.away_events where id=eid)<>'locked' then raise exception 'Paper correction kept stale sign-off';end if;
 -- Four real player identities can close every alternative entry method.
 foreach mode in array array['fullCardPlayer','finalStableford','finalGross'] loop
  p=jsonb_build_object('publicationId','synthetic-method-'||mode,'days',1,'fieldSize',4,'locked',true,'testMode',true,'confirmed','["p1","p2","p3","p4"]'::jsonb,'competitions','["single"]'::jsonb,'scoringMethods',jsonb_build_object('day1',mode),'groupSetup','{"day1":{"groups":[["p1","p2","p3","p4"]]}}'::jsonb);
  doc=jsonb_build_object('event',p,'players','[{"id":"p1"},{"id":"p2"},{"id":"p3"},{"id":"p4"}]'::jsonb,'courses','[]'::jsonb);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);select event_id,join_code into eid,code from public.create_away_event('Synthetic method sign-off',doc,doc->'players');select revision into rev from public.away_events where id=eid;perform public.golf_safe_away_save('event',eid,null,null,doc,rev,false,null,'locked');
  for j in 1..4 loop
   pid='p'||j;perform set_config('request.jwt.claim.sub',(case j when 1 then u1 when 2 then u2 when 3 then u3 else u4 end)::text,true);perform public.join_away_event(code,pid);
   if mode='fullCardPlayer' then
    select jsonb_object_agg(h::text,jsonb_build_object('self',jsonb_build_object('playerId',pid,'gross',4),'official',jsonb_build_object('playerId',pid,'gross',4)))||'{"_meta":{"finalisedAt":"2026-11-02T01:00:00Z","fullCardEnteredByPlayer":true}}'::jsonb into card from generate_series(1,18)h;
   else card=jsonb_build_object('_finalScore',jsonb_build_object('kind',case when mode='finalGross' then 'gross' else 'stableford' end,'total',case when mode='finalGross' then 82 else 36 end,'confirmedAt','2026-11-02T01:00:00Z'));end if;
   perform public.golf_safe_away_save('score',eid,1,pid,card,null,false,null,null);
  end loop;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);select revision into rev from public.away_events where id=eid;select jsonb_object_agg(day::text||':'||scorer_player_id,revision) into revisions from public.away_round_scores where event_id=eid;
  doc=jsonb_set(doc,'{event,finalResults}',jsonb_build_object('confirmedAt','2026-11-02T03:00:00Z','expectedScoreRevisions',revisions));r=public.golf_safe_away_save('event',eid,null,null,doc,rev,false,null,'complete');doc=r->'saved_data';
  r=public.golf_safe_away_save('event',eid,null,null,doc,(r->>'revision')::bigint,false,null,'archived');
  select score_data,revision into card,cardrev from public.away_round_scores where event_id=eid and scorer_player_id='p1';
  if mode='fullCardPlayer' then card=jsonb_set(jsonb_set(card,'{1,self,gross}','5'),'{1,official,gross}','5');else card=jsonb_set(card,'{_finalScore,total}','83');end if;
  perform public.golf_safe_away_save('score',eid,1,'p1',card,cardrev,true,'Synthetic archived correction',null);
  select event_data,revision into doc,rev from public.away_events where id=eid;select jsonb_object_agg(day::text||':'||scorer_player_id,revision) into revisions from public.away_round_scores where event_id=eid;
  doc=jsonb_set(doc,'{event,finalResults}',jsonb_build_object('confirmedAt','2026-11-02T04:00:00Z','expectedScoreRevisions',revisions));r=public.golf_safe_away_save('event',eid,null,null,doc,rev,false,null,'archived');
  if (select status from public.away_events where id=eid)<>'archived' or r->'saved_data'->'event'->'finalResults'->>'cloudAcceptedAt' is null then raise exception 'Archived reconfirmation reopened event or lacked receipt';end if;
  if exists(select 1 from public.away_event_invitation(code)) then raise exception 'Archived code reactivated';end if;
 end loop;
 -- Legacy closed plans deny guest authority even if their old row status is locked.
 p='{"days":1,"status":"complete","finalResults":{"confirmedAt":"2026-10-01T00:00:00Z"}}';
 insert into public.away_events(join_code,organiser_id,name,status,event_data) values('LEG159',owner_id,'Synthetic legacy close','locked',jsonb_build_object('event',p)) returning id into eid;
 insert into public.away_event_organisers(event_id,user_id,access_type) values(eid,guest,'guest');
 perform set_config('request.jwt.claim.sub',guest::text,true);
 if public.is_away_event_organiser(eid) or public.away_guest_organiser_active(eid) then raise exception 'Legacy closed event still grants guest authority';end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);rejected=false;
 begin perform public.create_away_event('Attempted seeded close',jsonb_build_object('event',p),'[]');exception when others then rejected=true;end;
 if not rejected then raise exception 'Creation seeded an unchecked final sign-off';end if;
 rejected=false;begin perform public.create_away_guest_organiser_key(eid);exception when others then rejected=true;end;if not rejected then raise exception 'Closed event delegated';end if;
 if golf_safe_private.scoring_is_open(jsonb_build_object('date',to_char((now()+interval '1 hour') at time zone 'UTC','YYYY-MM-DD'),'timeZone','UTC','startTimes',jsonb_build_object('day1',jsonb_build_array(to_char((now()+interval '1 hour') at time zone 'UTC','HH24:MI:SS')))),1) then raise exception 'Opening boundary admits future round';end if;
 if not golf_safe_private.scoring_is_open(jsonb_build_object('date',to_char(now() at time zone 'UTC','YYYY-MM-DD'),'timeZone','UTC','startTimes',jsonb_build_object('day1',jsonb_build_array(to_char(now() at time zone 'UTC','HH24:MI:SS')))),1) then raise exception 'Opening boundary rejects open round';end if;
 -- Helpers have no public application execution grants.
 if has_function_privilege('authenticated','golf_safe_private.assert_event_complete(uuid,jsonb)','EXECUTE') or has_function_privilege('anon','golf_safe_private.validate_ambrose(jsonb,jsonb,text,integer,jsonb)','EXECUTE') then raise exception 'Private lifecycle helper exposed';end if;
end $$;
rollback;
