-- Score acceptance follows the published event method and trusted course snapshot.
create or replace function golf_safe_private.competition_on(plan jsonb, cid text, day_no integer)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(plan->'competitions' ? cid,false) and (
   (cid='capTeams') or
   (cid='scratch' and plan->>'scratchFormat' in ('aggregate','bestAggregate')) or
   (cid='par3' and coalesce(plan->>'par3Mode',case when plan->>'par3Format'='aggregate' then 'overallPairs' else 'dailyPairs' end) in ('overallPlayers','overallPairs')) or
   coalesce(plan->'competitionDays'->cid,case when cid='yellowBall' then plan->'yellowBallDays' end) is null or
   coalesce(plan->'competitionDays'->cid,case when cid='yellowBall' then plan->'yellowBallDays' end) @> to_jsonb(array[day_no])
 );
$$;

create or replace function golf_safe_private.gross_agree(plan jsonb,pid text,day_no integer,hole integer,a text,b text)
returns boolean language plpgsql immutable set search_path='' as $$
declare c jsonb;card jsonb;category text='men';tee text;actual_id text;idx text;primary_idx integer;hcp integer;par integer;shots integer=0;extra integer;ap integer;bp integer;
begin
 if nullif(a,'') is null or nullif(b,'') is null then return false;end if;
 if upper(a)=upper(b) then return true;end if;
 if exists(select 1 from unnest(array['stroke','scratch','eclectic']) x where golf_safe_private.competition_on(plan,x,day_no)) then return false;end if;
 if not exists(select 1 from unnest(array['single','combined','fourball','best3of4','par3','yellowBall','capTeams']) x where golf_safe_private.competition_on(plan,x,day_no)) then return false;end if;
 actual_id=coalesce(plan->'sharedPositions'->golf_safe_private.shared_slot(plan,pid)->>('day'||day_no),pid);
 if coalesce(plan->>'courseCategoryVersion','') not in ('','0','false') and plan->'gaCategories'->>actual_id='women' then category='women';end if;
 tee=coalesce(nullif(plan->'teeSelectionByCategory'->('day'||day_no)->>category,''),nullif(plan->'teeSelection'->>('day'||day_no),''),'middle');
 select value into c from jsonb_array_elements(coalesce(plan->'_scoreAcceptanceCourses','[]')) where value->>'id'=plan->>('course'||day_no) limit 1;
 if category='women' then c=c->'womenTeeData';end if;
 card=c->'teeScorecards'->tee;
 if card is null then
   select value into card from jsonb_array_elements(coalesce(c->'versions','[]')) where value->>'id'=c->>'activeVersionId' limit 1;
   card=coalesce(card,c->'versions'->0);
 end if;
 par=nullif(card->'par'->>(hole-1),'')::integer;
 idx=btrim(coalesce(card->'index'->>(hole-1),''));
 hcp=coalesce(nullif(plan->'teeHandicaps'->('day'||day_no)->tee->>pid,'')::integer,nullif(plan->'dailyHandicaps'->('day'||day_no)->>pid,'')::integer);
 if par is null or par not between 3 and 6 or idx='' or hcp is null then return false;end if;
 if split_part(idx,'/',1) !~ '^[0-9]+$' then return false;end if;
 primary_idx=split_part(idx,'/',1)::integer;
 if hcp<0 then
   shots=-(abs(hcp)/18)-case when primary_idx>18-(abs(hcp)%18) then 1 else 0 end;
 elsif hcp>0 and position('/' in idx)>0 then
   select count(*) into shots from unnest(string_to_array(idx,'/')) x where btrim(x) ~ '^[0-9]+$' and btrim(x)::integer>0 and btrim(x)::integer<=hcp;
   if hcp>36 and primary_idx between 1 and 18 and not (plan->'finalResults'->>'confirmedAt' is not null and coalesce(plan->'finalResults'->>'scoringRulesVersion','')<>'2') then
     extra=hcp-36;shots=shots+(extra/18)+case when primary_idx<=extra%18 then 1 else 0 end;
   end if;
 elsif hcp>0 then shots=hcp/18+case when primary_idx<=hcp%18 then 1 else 0 end;
 end if;
 if upper(a)<>'P' and a !~ '^([1-9]|[12][0-9]|30)$' then return false;end if;
 if upper(b)<>'P' and b !~ '^([1-9]|[12][0-9]|30)$' then return false;end if;
 ap=case when upper(a)='P' then 0 else greatest(0,2+par+shots-a::integer) end;
 bp=case when upper(b)='P' then 0 else greatest(0,2+par+shots-b::integer) end;
 return ap=0 and bp=0;
end;
$$;

create or replace function golf_safe_private.validate_score(data jsonb,plan jsonb,pid text,day_no integer,organiser boolean)
returns void language plpgsql set search_path='' as $$
declare h text;rec jsonb;section jsonb;group_ids jsonb;ids text[];pos integer;target text;fourball boolean;v text;method text=coalesce(plan->'scoringMethods'->>('day'||day_no),'holeByHole');total jsonb;
begin
 if day_no is null or day_no not between 1 and coalesce((plan->>'days')::integer,1) or jsonb_typeof(data) is distinct from 'object' or pg_column_size(data)>120000 then raise exception 'Invalid score record' using errcode='22023';end if;
 if method not in ('holeByHole','fullCardPlayer','finalStableford','finalGross') then raise exception 'Unknown published scoring method';end if;
 for group_ids in select value from jsonb_array_elements(coalesce(plan->'groupSetup'->('day'||day_no)->'groups','[]')) loop
   select array_agg(value order by ordinality) into ids from jsonb_array_elements_text(group_ids) with ordinality where value<>'system-no-partner';
   pos=array_position(ids,pid);exit when pos is not null;
 end loop;
 if not organiser and pos is null then raise exception 'Player is not assigned to this day' using errcode='42501';end if;
 if method='fullCardPlayer' then target=pid;
 elsif pos is not null then
   fourball=golf_safe_private.competition_on(plan,'fourball',day_no);
   if cardinality(ids)=3 or not fourball then target=ids[(pos%cardinality(ids))+1];
   else target=ids[case when pos%2=1 then pos+1 else pos-1 end];end if;
 end if;
 if method in ('finalStableford','finalGross') then
   total=data->'_finalScore';
   if jsonb_typeof(total) is distinct from 'object' or jsonb_typeof(total->'total') is distinct from 'number' or
      (total->>'total') !~ '^[0-9]+$' or (total->>'total')::integer not between (case when method='finalGross' then 1 else 0 end) and 400 or
      (total->>'kind') is distinct from (case when method='finalGross' then 'gross' else 'stableford' end) or nullif(total->>'confirmedAt','') is null then raise exception 'Invalid final score';end if;
   perform (total->>'confirmedAt')::timestamptz;
   if total ? 'putts' and total->>'putts'<>'' and (jsonb_typeof(total->'putts') is distinct from 'number' or (total->>'putts') !~ '^[0-9]+$' or (total->>'putts')::integer not between 0 and 100) then raise exception 'Invalid final putts';end if;
 end if;
 for h,rec in select * from jsonb_each(data) loop
   if h='_meta' then
     if jsonb_typeof(rec) is distinct from 'object' then raise exception 'Invalid card metadata';end if;
     if nullif(rec->>'finalisedAt','') is not null then perform (rec->>'finalisedAt')::timestamptz;end if;
     continue;
   end if;
   if h='_finalScore' and method in ('finalStableford','finalGross') then continue;end if;
   if method in ('finalStableford','finalGross') or h !~ '^([1-9]|1[0-8])$' or jsonb_typeof(rec) is distinct from 'object' then raise exception 'Invalid hole key';end if;
   for section in select value from jsonb_each(rec) where key in ('official','self') loop
     if jsonb_typeof(section) is distinct from 'object' then raise exception 'Invalid score entry';end if;
     v=section->>'gross';if v is not null and v<>'' and upper(v)<>'P' and v !~ '^([1-9]|[12][0-9]|30)$' then raise exception 'Gross score must be 1–30 or P';end if;
     v=section->>'putts';if v is not null and v<>'' and v !~ '^[0-9]$' then raise exception 'Putts must be 0–9';end if;
     if coalesce(section->>'gross','') ~ '^[0-9]+$' and coalesce(section->>'putts','') ~ '^[0-9]+$' and (section->>'putts')::integer>(section->>'gross')::integer then raise exception 'Putts exceed strokes';end if;
   end loop;
   if not organiser then
     if nullif(rec->'self'->>'playerId','') is not null and rec->'self'->>'playerId'<>pid then raise exception 'Incorrect self player' using errcode='42501';end if;
     if nullif(rec->'official'->>'playerId','') is not null and rec->'official'->>'playerId' is distinct from target then raise exception 'Incorrect assigned marker target' using errcode='42501';end if;
     if coalesce((rec->'official'->>'organiserCorrected')::boolean,false) or coalesce((rec->'official'->>'emergencyRecovered')::boolean,false) then raise exception 'Organiser correction required' using errcode='42501';end if;
   end if;
 end loop;
end;
$$;

create or replace function golf_safe_private.closed(plan jsonb,day_no integer,pid text,old_data jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(plan->>'status' in ('complete','completed','cancelled','archived'),false)
 or nullif(plan->'roundFinalised'->('day'||day_no)->>pid,'') is not null
 or nullif(old_data->'_meta'->>'finalisedAt','') is not null
 or nullif(old_data->'_finalScore'->>'confirmedAt','') is not null
 or coalesce(plan->'manualScorecards'->('day'||day_no)->>'status'='submitted',false);
$$;

create or replace function golf_safe_private.guard_player(data jsonb,old_data jsonb,plan jsonb,pid text,day_no integer,cards jsonb)
returns void language plpgsql set search_path='' as $$
declare h text;rec jsonb;target text;marker jsonb;putting boolean;ambrose boolean;method text=coalesce(plan->'scoringMethods'->>('day'||day_no),'holeByHole');
begin
 putting=golf_safe_private.competition_on(plan,'teamPutts',day_no);
 ambrose=golf_safe_private.competition_on(plan,'ambrose',day_no);
 if coalesce((data->'_meta'->>'emergencyFinalised')::boolean,false) and data->'_meta'->'emergencyFinalised' is distinct from old_data->'_meta'->'emergencyFinalised' then raise exception 'Organiser acceptance required' using errcode='42501';end if;
 if method in ('finalStableford','finalGross') then return;end if;
 if method='holeByHole' then
   for h,rec in select * from jsonb_each(data) where key<>'_meta' loop
     target=rec->'official'->>'playerId';
     if target is not null and rec->'official' is distinct from old_data->h->'official' and golf_safe_private.closed(plan,day_no,target,cards->target) then raise exception 'GOLF_CLOSED: Marked card accepted. Use organiser correction.' using errcode='42501';end if;
   end loop;
 end if;
 if nullif(data->'_meta'->>'finalisedAt','') is not null then
   for h in select generate_series(1,18)::text loop
     rec=data->h;
     if nullif(rec->'self'->>'gross','') is null then raise exception 'All 18 self scores are required for acceptance';end if;
     if method='fullCardPlayer' then
       if rec->'official'->>'playerId' is distinct from pid or not golf_safe_private.gross_agree(plan,pid,day_no,h::integer,rec->'self'->>'gross',rec->'official'->>'gross') then raise exception 'Full card entries must agree';end if;
       if putting and (nullif(rec->'self'->>'putts','') is null or nullif(rec->'official'->>'putts','') is null or (rec->'self'->>'putts')::integer is distinct from (rec->'official'->>'putts')::integer) then raise exception 'Putts do not agree';end if;
     elsif ambrose then
       if nullif(rec->'ambrose'->>'drivePlayerId','') is null then raise exception 'Every Ambrose hole requires a selected drive';end if;
     else
       target=rec->'official'->>'playerId';
       if target is null or not golf_safe_private.gross_agree(plan,target,day_no,h::integer,rec->'official'->>'gross',cards->target->h->'self'->>'gross') then raise exception 'Marked card does not agree online yet';end if;
       select value->h->'official' into marker from jsonb_each(cards) where value->h->'official'->>'playerId'=pid limit 1;
       if not golf_safe_private.gross_agree(plan,pid,day_no,h::integer,rec->'self'->>'gross',marker->>'gross') then raise exception 'Own card does not agree online yet';end if;
       if putting and (nullif(rec->'self'->>'putts','') is null or nullif(rec->'official'->>'putts','') is null or (rec->'self'->>'putts')::integer is distinct from (marker->>'putts')::integer or (rec->'official'->>'putts')::integer is distinct from (cards->target->h->'self'->>'putts')::integer) then raise exception 'Putts do not agree online yet';end if;
     end if;
   end loop;
 end if;
end;
$$;

revoke all on function golf_safe_private.competition_on(jsonb,text,integer),golf_safe_private.gross_agree(jsonb,text,integer,integer,text,text) from public,anon,authenticated;
revoke all on function golf_safe_private.validate_score(jsonb,jsonb,text,integer,boolean),golf_safe_private.closed(jsonb,integer,text,jsonb),golf_safe_private.guard_player(jsonb,jsonb,jsonb,text,integer,jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.golf_safe_away_save(p_kind text, p_event_id uuid, p_day integer, p_player_id text, p_data jsonb, p_expected_revision bigint, p_correction boolean DEFAULT false, p_reason text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.away_events;old_row public.away_round_scores;organiser boolean;result jsonb;cards jsonb;
begin
 select * into e from public.away_events where id=p_event_id for update;
 organiser=public.is_away_event_organiser(p_event_id);
 if p_kind='event' then
  if not coalesce(organiser,false) then raise exception 'Organiser access required' using errcode='42501';end if;
  if e.revision is distinct from p_expected_revision then raise exception 'Event changed' using errcode='40001';end if;
  if jsonb_typeof(p_data->'event') is distinct from 'object' or pg_column_size(p_data)>1500000 then raise exception 'Invalid event';end if;
  if jsonb_typeof(p_data->'players') is distinct from 'array' or (select count(distinct value->>'id') from jsonb_array_elements(p_data->'players'))<>jsonb_array_length(p_data->'players') then raise exception 'Invalid player roster';end if;
  if exists(select 1 from public.away_round_scores where event_id=p_event_id and scorer_player_id not in(select value->>'id' from jsonb_array_elements(p_data->'players'))) then raise exception 'Players with saved scores cannot be removed';end if;
  perform golf_safe_private.validate_substitution(e.event_data->'event',p_data->'event',(select coalesce(jsonb_agg(jsonb_build_object('day',day,'score_data',score_data)),'[]') from public.away_round_scores where event_id=p_event_id));
  perform golf_safe_private.validate_shared_positions(e.event_data->'event',p_data->'event',p_data->'players',least(16,(p_data->'event'->>'fieldSize')::integer));
  insert into public.away_event_players(event_id,player_id,display_name,player_data) select p_event_id,value->>'id',coalesce(value->>'name','Player'),value-'id'-'name' from jsonb_array_elements(p_data->'players') on conflict(event_id,player_id) do update set display_name=excluded.display_name,player_data=excluded.player_data;
  delete from public.away_event_players where event_id=p_event_id and player_id not in(select value->>'id' from jsonb_array_elements(p_data->'players'));
  insert into golf_safe_private.corrections(event_id,actor,reason,before_data,after_data) values(p_event_id,auth.uid(),'Organiser event plan update',e.event_data,p_data);
  update public.away_events set event_data=p_data,name=coalesce(p_data->'event'->>'name',name),status=coalesce(p_status,status) where id=p_event_id returning jsonb_build_object('id',id,'join_code',join_code,'revision',revision,'updated_at',updated_at) into result;return result;
 end if;
 if p_kind<>'score' then raise exception 'Unknown save kind';end if;
 if not coalesce(organiser,false) and not exists(select 1 from public.away_event_players where event_id=p_event_id and player_id=p_player_id and member_user_id=auth.uid()) then raise exception 'Player connection required' using errcode='42501';end if;
 if not exists(select 1 from public.away_event_players where event_id=p_event_id and player_id=p_player_id) then raise exception 'Player is outside event';end if;
 if coalesce(e.event_data->'event'->'sharedPositions','{}')<>'{}'::jsonb and not exists(select 1 from jsonb_array_elements_text(coalesce(e.event_data->'event'->'dayFields'->('day'||p_day),'[]')) where value=p_player_id) then raise exception 'This golfer is not assigned to this day' using errcode='42501';end if;
 select * into old_row from public.away_round_scores where event_id=p_event_id and day=p_day and scorer_player_id=p_player_id;
 if old_row.revision is distinct from p_expected_revision then raise exception 'Scores changed' using errcode='40001';end if;
 if old_row.score_data is not distinct from p_data then return jsonb_build_object('revision',old_row.revision,'updated_at',old_row.updated_at);end if;
 if p_correction then
  if not coalesce(organiser,false) or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Audited organiser correction required' using errcode='42501';end if;
  insert into golf_safe_private.corrections(event_id,day,player_id,actor,reason,before_data,after_data) values(p_event_id,p_day,p_player_id,auth.uid(),p_reason,old_row.score_data,p_data);
 elsif golf_safe_private.closed(e.event_data->'event',p_day,p_player_id,old_row.score_data) or e.status in ('archived','completed','cancelled') then raise exception 'GOLF_CLOSED: Card accepted. Use organiser correction.' using errcode='42501';
 end if;
 if e.status<>'locked' and not p_correction then raise exception 'Final event update required';end if;
 perform golf_safe_private.validate_score(p_data,e.event_data->'event',p_player_id,p_day,coalesce(organiser,false));
 if not coalesce(organiser,false) then
  select jsonb_object_agg(scorer_player_id,score_data) into cards from public.away_round_scores where event_id=p_event_id and day=p_day;
  perform golf_safe_private.guard_player(p_data,old_row.score_data,(e.event_data->'event') || jsonb_build_object('_scoreAcceptanceCourses',e.event_data->'courses'),p_player_id,p_day,coalesce(cards,'{}'));
 end if;

 insert into public.away_round_scores(event_id,day,scorer_player_id,score_data) values(p_event_id,p_day,p_player_id,p_data) on conflict(event_id,day,scorer_player_id) do update set score_data=excluded.score_data returning jsonb_build_object('revision',revision,'updated_at',updated_at) into result;return result;
end;$function$
;

-- Pure synthetic assertions: no event, course, user or score rows are written.
do $$
declare plan jsonb;course jsonb;card jsonb;full_card jsonb;cards jsonb='{}';pid text;target text;j integer;rejected boolean;sample jsonb;method text;
begin
 select jsonb_build_object('id','synthetic-course','teeScorecards',jsonb_build_object('middle',jsonb_build_object('par',jsonb_agg(4),'index',jsonb_agg(i)))) into course from generate_series(1,18)i;
 plan=jsonb_build_object('days',1,'competitions',jsonb_build_array('single'),'course1','synthetic-course','teeSelection',jsonb_build_object('day1','middle'),'dailyHandicaps',jsonb_build_object('day1',jsonb_build_object('p1',0,'p2',0,'p3',0,'p4',0)),'groupSetup',jsonb_build_object('day1',jsonb_build_object('groups',jsonb_build_array(jsonb_build_array('p1','p2','p3','p4')))),'_scoreAcceptanceCourses',jsonb_build_array(course));
 if not golf_safe_private.gross_agree(plan,'p1',1,1,'P','6') then raise exception 'Stableford pickup equivalence failed';end if;
 if golf_safe_private.gross_agree(plan,'p1',1,1,'P','5') then raise exception 'A scoring bogey must not equal pickup';end if;
 if not golf_safe_private.gross_agree(plan,'p1',1,1,'6','7') then raise exception 'Zero-point equivalence differs from the client';end if;
 if golf_safe_private.gross_agree(plan||'{"competitions":["single","scratch"]}','p1',1,1,'P','6') then raise exception 'Scratch requires literal gross agreement';end if;
 if golf_safe_private.gross_agree(plan||'{"competitions":["single","eclectic"]}','p1',1,1,'P','6') then raise exception 'Eclectic policy was changed unintentionally';end if;
 if not golf_safe_private.gross_agree(plan||'{"competitions":["single","scratch"],"competitionDays":{"scratch":[2]}}','p1',1,1,'P','6') then raise exception 'Daily competition scope ignored';end if;
 if golf_safe_private.gross_agree(plan-'_scoreAcceptanceCourses','p1',1,1,'P','6') then raise exception 'Missing trusted card must fail closed';end if;
 if not golf_safe_private.gross_agree(plan||'{"dailyHandicaps":{"day1":{"p1":-4}}}','p1',1,18,'P','5') then raise exception 'Plus handicap at easy hole failed';end if;
 if golf_safe_private.gross_agree(plan||'{"dailyHandicaps":{"day1":{"p1":-4}}}','p1',1,1,'P','5') then raise exception 'Plus handicap applied to wrong hole';end if;
 course=jsonb_set(course,'{teeScorecards,middle,index,0}','"1/19"');
 if not golf_safe_private.gross_agree(plan||jsonb_build_object('_scoreAcceptanceCourses',jsonb_build_array(course),'dailyHandicaps','{"day1":{"p1":40}}'::jsonb),'p1',1,1,'P','9') then raise exception 'Dual index above 36 failed';end if;
 course=jsonb_set(course,'{womenTeeData}',jsonb_build_object('teeScorecards',jsonb_build_object('middle',jsonb_build_object('par',jsonb_build_array(5),'index',jsonb_build_array(1)))));
 if not golf_safe_private.gross_agree(plan||jsonb_build_object('_scoreAcceptanceCourses',jsonb_build_array(course),'courseCategoryVersion',1,'gaCategories','{"p1":"women"}'::jsonb),'p1',1,1,'P','7') then raise exception 'Women course snapshot was not used';end if;
 -- Ordinary four-player marker rotation; all P/6 comparisons give zero points.
 for j in 1..4 loop
   pid='p'||j;target='p'||(j%4+1);
   select jsonb_object_agg(i::text,jsonb_build_object('self',jsonb_build_object('playerId',pid,'gross',6),'official',jsonb_build_object('playerId',target,'gross','P'))) into card from generate_series(1,18)i;
   cards=cards||jsonb_build_object(pid,card);
 end loop;
 card=cards->'p1'||'{"_meta":{"finalisedAt":"2026-11-01T10:00:00Z"}}';
 perform golf_safe_private.validate_score(card,plan,'p1',1,false);
 perform golf_safe_private.guard_player(card,cards->'p1',plan,'p1',1,cards);
 -- Genuine one-point mismatch must still block acceptance.
 cards=jsonb_set(cards,'{p4,1,official,gross}','5');rejected=false;
 begin perform golf_safe_private.guard_player(card,'{}',plan,'p1',1,cards);exception when others then rejected=true;end;
 if not rejected then raise exception 'A real score mismatch was accepted';end if;
 select jsonb_object_agg(i::text,jsonb_build_object('self',jsonb_build_object('playerId','p1','gross',4,'putts',2),'official',jsonb_build_object('playerId','p1','gross',4,'putts',2)))||'{"_meta":{"finalisedAt":"2026-11-01T10:00:00Z","fullCardEnteredByPlayer":true}}'::jsonb into full_card from generate_series(1,18)i;
 perform golf_safe_private.validate_score(full_card,plan||'{"scoringMethods":{"day1":"fullCardPlayer"}}','p1',1,false);
 perform golf_safe_private.guard_player(full_card,'{}',plan||'{"scoringMethods":{"day1":"fullCardPlayer"},"competitions":["single","teamPutts"]}','p1',1,'{}');
 rejected=false;
 begin perform golf_safe_private.validate_score(full_card,plan,'p1',1,false);exception when others then rejected=true;end;
 if not rejected then raise exception 'Client metadata bypassed the published marker method';end if;
 rejected=false;
 begin perform golf_safe_private.guard_player(full_card-'18','{}',plan||'{"scoringMethods":{"day1":"fullCardPlayer"}}','p1',1,'{}');exception when others then rejected=true;end;
 if not rejected then raise exception 'Incomplete full card accepted';end if;
 rejected=false;
 begin perform golf_safe_private.guard_player(jsonb_set(full_card,'{1,self,putts}','1'),'{}',plan||'{"scoringMethods":{"day1":"fullCardPlayer"},"competitions":["single","teamPutts"]}','p1',1,'{}');exception when others then rejected=true;end;
 if not rejected then raise exception 'Mismatched full-card putts accepted';end if;
 foreach method in array array['finalStableford','finalGross'] loop
   sample=jsonb_build_object('_finalScore',jsonb_build_object('kind',case when method='finalGross' then 'gross' else 'stableford' end,'total',case when method='finalGross' then 82 else 0 end,'putts',30,'confirmedAt','2026-11-01T10:00:00Z'));
   perform golf_safe_private.validate_score(sample,plan||jsonb_build_object('scoringMethods',jsonb_build_object('day1',method)),'p1',1,false);
   perform golf_safe_private.guard_player(sample,'{}',plan||jsonb_build_object('scoringMethods',jsonb_build_object('day1',method)),'p1',1,'{}');
   if not golf_safe_private.closed(plan,1,'p1',sample) then raise exception 'Accepted final total is not protected';end if;
 end loop;
 for sample in select value from jsonb_array_elements('[{"_finalScore":{"kind":"stableford","total":-1,"confirmedAt":"today"}},{"_finalScore":{"kind":"stableford","total":2.5,"confirmedAt":"today"}},{"_finalScore":{"kind":"stableford","total":"36","confirmedAt":"today"}},{"_finalScore":{"kind":"stableford","total":401,"confirmedAt":"today"}},{"_finalScore":{"kind":"gross","total":82,"confirmedAt":"today"}}]') loop
   rejected=false;
   begin perform golf_safe_private.validate_score(sample,plan||'{"scoringMethods":{"day1":"finalStableford"}}','p1',1,false);exception when others then rejected=true;end;
   if not rejected then raise exception 'Invalid or wrong-method total accepted: %',sample;end if;
 end loop;
 rejected=false;
 begin perform golf_safe_private.validate_score('{"_finalScore":{"kind":"stableford","total":36,"confirmedAt":"2026-11-01T10:00:00Z"}}',plan,'p1',1,false);exception when others then rejected=true;end;
 if not rejected then raise exception 'Final total bypassed hole-by-hole event method';end if;
 if has_function_privilege('authenticated','golf_safe_private.gross_agree(jsonb,text,integer,integer,text,text)','EXECUTE') or has_function_privilege('anon','golf_safe_private.competition_on(jsonb,text,integer)','EXECUTE') then raise exception 'Private acceptance helpers are publicly callable';end if;
 raise notice 'Score acceptance synthetic assertions passed';
end;
$$;
