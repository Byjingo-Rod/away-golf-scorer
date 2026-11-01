-- Server-side lifecycle checks shared by every application entry path.
create or replace function golf_safe_private.scoring_started(eid uuid,d integer)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.away_round_scores s where s.event_id=eid and s.day=d and
   (nullif(s.score_data->'_finalScore'->>'confirmedAt','') is not null or exists(
     select 1 from jsonb_each(s.score_data) h where h.key ~ '^([1-9]|1[0-8])$' and
       (nullif(h.value->'self'->>'gross','') is not null or nullif(h.value->'official'->>'gross','') is not null or nullif(h.value->'self'->>'putts','') is not null or nullif(h.value->'official'->>'putts','') is not null))))
 or exists(select 1 from public.away_events e where e.id=eid and coalesce(e.event_data->'event'->'manualScorecards'->('day'||d)->'groups','{}')<>'{}'::jsonb);
$$;

create or replace function golf_safe_private.round_settings(p jsonb,d integer)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('course',p->('course'||d),'groups',p->'groupSetup'->('day'||d)->'groups',
 'starts',p->'groupSetup'->('day'||d)->'starts','fields',coalesce(p->'dayFields'->('day'||d),p->'confirmed'),
 'tee',p->'teeSelection'->('day'||d),'categoryTees',p->'teeSelectionByCategory'->('day'||d),
 'handicaps',p->'dailyHandicaps'->('day'||d),'teeHandicaps',p->'teeHandicaps'->('day'||d),
 'startMethod',coalesce(p->'startMethods'->('day'||d),p->'startMethod'),'startHoles',coalesce(p->'startHoles'->('day'||d),p->'twoTeeStarts'->('day'||d)),
 'method',coalesce(p->'scoringMethods'->>('day'||d),'holeByHole'),'ambroseRoles',p->'ambroseRoleAssignments'->('day'||d),
 'ambroseMode',p->'ambroseScoringMode','minimumDrives',p->'ambroseMinimumDrives');
$$;

create or replace function golf_safe_private.scoring_is_open(p jsonb,d integer)
returns boolean language plpgsql stable set search_path='' as $$
declare date_value date;tee time;zone text;opens timestamptz;key text='day'||d;
begin
 if coalesce((p->>'testMode')::boolean,false) or coalesce((p->>'ridgeTestMode')::boolean,false) then return true;end if;
 if coalesce(p->'scoringOpenedEarly'->>key,'') not in ('','false','null') then return true;end if;
 date_value=coalesce(nullif(p->'dayDates'->>key,'')::date,nullif(p->>'date','')::date+d-1);
 if date_value is null then return false;end if;
 zone=coalesce(nullif(p->>'timeZone',''),'Australia/Sydney');
 if not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Invalid event time zone';end if;
 select min(value::time) into tee from jsonb_array_elements_text(coalesce(p->'startTimes'->key,'["07:30"]')) with ordinality t(value,n)
 where n=1 or coalesce(p->'startMethods'->>key,p->>'startMethod','single')='two';
 opens=((date_value+coalesce(tee,'07:30'::time)) at time zone zone)-interval '15 minutes';
 return now()>=opens;
end;$$;

create or replace function golf_safe_private.ambrose_roles(p jsonb,d integer,pid text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare g jsonb;team jsonb;idx integer=0;scorer text;marker text;a jsonb;
begin
 for g in select value from jsonb_array_elements(coalesce(p->'groupSetup'->('day'||d)->'groups','[]')) loop
   if g ? pid then
     select jsonb_agg(value order by ord) into team from jsonb_array_elements_text(g) with ordinality t(value,ord) where value<>'system-no-partner';
     a=p->'ambroseRoleAssignments'->('day'||d)->idx::text;
     scorer=case when team ? coalesce(a->>'scorerId','') then a->>'scorerId' else team->>0 end;
     if coalesce(p->>'ambroseScoringMode','')<>'scorerOnly' then
       select value into marker from jsonb_array_elements_text(team) where value<>scorer order by (value=coalesce(a->>'markerId','')) desc limit 1;
     end if;
     return jsonb_build_object('scorer',scorer,'marker',marker,'team',team,'index',idx);
   end if;idx=idx+1;
 end loop;
 raise exception 'Player is outside the published team' using errcode='42501';
end;$$;

create or replace function golf_safe_private.validate_ambrose(data jsonb,plan jsonb,pid text,d integer,cards jsonb)
returns void language plpgsql set search_path='' as $$
declare roles jsonb=golf_safe_private.ambrose_roles(plan,d,pid);h text;r jsonb;other jsonb;partner text;finalising boolean=nullif(data->'_meta'->>'finalisedAt','') is not null;counts jsonb='{}';drive text;minimum integer=coalesce((plan->>'ambroseMinimumDrives')::integer,0);compliant boolean=true;
begin
 if pid is distinct from roles->>'scorer' and pid is distinct from roles->>'marker' then raise exception 'Only the published Ambrose scorer or marker may submit' using errcode='42501';end if;
 partner=case when pid=roles->>'scorer' then roles->>'marker' else roles->>'scorer' end;
 for h,r in select * from jsonb_each(data) where key ~ '^([1-9]|1[0-8])$' loop
   drive=r->'ambrose'->>'drivePlayerId';
   if nullif(drive,'') is not null and not (roles->'team' ? drive) then raise exception 'Selected drive must belong to this team';end if;
   if nullif(drive,'') is not null then counts=jsonb_set(counts,array[drive],to_jsonb(coalesce((counts->>drive)::integer,0)+1));end if;
   if not finalising and partner is not null and nullif(cards->partner->'_meta'->>'finalisedAt','') is not null and (r->'self'->>'gross' is distinct from cards->partner->h->'self'->>'gross' or drive is distinct from cards->partner->h->'ambrose'->>'drivePlayerId') then raise exception 'GOLF_CLOSED: Accepted Ambrose card requires organiser correction' using errcode='42501';end if;
   if finalising then
     if coalesce(r->'self'->>'gross','') !~ '^([1-9]|[12][0-9]|30)$' or nullif(drive,'') is null then raise exception 'Every Ambrose hole needs strokes and a team drive';end if;
     if partner is not null then
       other=cards->partner->h;
       if r->'self'->>'gross' is distinct from other->'self'->>'gross' or drive is distinct from other->'ambrose'->>'drivePlayerId' then raise exception 'Ambrose scorer and marker do not agree online yet';end if;
     end if;
   end if;
 end loop;
 if finalising then
   for h in select generate_series(1,18)::text loop if not (data ? h) then raise exception 'All 18 Ambrose holes are required';end if;end loop;
   for drive in select jsonb_array_elements_text(roles->'team') loop if coalesce((counts->>drive)::integer,0)<minimum then compliant=false;end if;end loop;
   if data->'_meta'->>'ambroseDriveCompliant' is distinct from compliant::text then raise exception 'Ambrose drive compliance must match the selected drives';end if;
 end if;
end;$$;

create or replace function golf_safe_private.assert_event_complete(eid uuid,doc jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare p jsonb=doc->'event';d integer;g jsonb;idx integer;pid text;card jsonb;cards jsonb;roles jsonb;paper jsonb;h text;official jsonb;method text;revisions jsonb;
begin
 if coalesce((p->>'days')::integer,0) not between 1 and 7 then raise exception 'Invalid playing-day count';end if;
 if exists(select 1 from golf_safe_private.conflicts where event_id=eid and resolved_at is null) then raise exception 'Review saved copies before confirming final results';end if;
 for d in 1..coalesce((p->>'days')::integer,1) loop
   method=coalesce(p->'scoringMethods'->>('day'||d),'holeByHole');idx=0;
   if jsonb_array_length(coalesce(p->'groupSetup'->('day'||d)->'groups','[]'))=0 then raise exception 'Published teams are required for final sign-off';end if;
   if not exists(select 1 from jsonb_array_elements(p->'groupSetup'->('day'||d)->'groups') g cross join lateral jsonb_array_elements_text(g.value) pid where pid.value<>'system-no-partner') then raise exception 'A real playing field is required for final sign-off';end if;
   if exists(select 1 from jsonb_array_elements_text(coalesce(p->'dayFields'->('day'||d),p->'confirmed','[]')) pid where pid.value<>'system-no-partner' and not exists(select 1 from jsonb_array_elements(p->'groupSetup'->('day'||d)->'groups') g where g.value ? pid.value)) then raise exception 'Every daily golfer needs a published team';end if;
   select coalesce(jsonb_object_agg(scorer_player_id,score_data),'{}') into cards from public.away_round_scores where event_id=eid and day=d;
   for g in select value from jsonb_array_elements(p->'groupSetup'->('day'||d)->'groups') loop
     paper=p->'manualScorecards'->('day'||d)->'groups'->idx::text;
     if paper->>'status'='submitted' and nullif(paper->>'submittedAt','') is not null and paper->>'source'='paper-team-card' and coalesce(paper->'playerIds','[]') @> (select jsonb_agg(value) from jsonb_array_elements_text(g) where value<>'system-no-partner') and (coalesce(paper->'players','{}')<>'{}'::jsonb or coalesce(paper->'pairs','{}')<>'{}'::jsonb or coalesce(paper->'team','{}')<>'{}'::jsonb) then idx=idx+1;continue;end if;
     for pid in select jsonb_array_elements_text(g) loop
       if pid='system-no-partner' then continue;end if;card=cards->pid;
       if golf_safe_private.competition_on(p,'ambrose',d) then
         roles=golf_safe_private.ambrose_roles(p,d,pid);
         if pid is distinct from roles->>'scorer' and pid is distinct from roles->>'marker' then continue;end if;
       end if;
       if method in ('finalStableford','finalGross') then
         perform golf_safe_private.validate_score(card,p,pid,d,false);
       else
         if nullif(card->'_meta'->>'finalisedAt','') is null then raise exception 'Every required card must be accepted online before close';end if;
         perform golf_safe_private.validate_score(card,p,pid,d,true);
         if coalesce((card->'_meta'->>'emergencyFinalised')::boolean,false) then
           for h in select generate_series(1,18)::text loop
             select value->h->'official' into official from jsonb_each(cards) where value->h->'official'->>'playerId'=pid limit 1;
             if nullif(official->>'gross','') is null then raise exception 'Emergency acceptance requires a complete official card';end if;
           end loop;
         else
           perform golf_safe_private.guard_player(card,card,p||jsonb_build_object('_scoreAcceptanceCourses',doc->'courses'),pid,d,cards);
         end if;
       end if;
     end loop;idx=idx+1;
   end loop;
 end loop;
 select coalesce(jsonb_object_agg(day::text||':'||scorer_player_id,revision),'{}') into revisions from public.away_round_scores where event_id=eid;
 return revisions;
end;$$;

-- Explicit grants: these helpers may run only inside authorised server gateways.
revoke all on function golf_safe_private.scoring_started(uuid,integer),golf_safe_private.round_settings(jsonb,integer),golf_safe_private.scoring_is_open(jsonb,integer),golf_safe_private.ambrose_roles(jsonb,integer,text),golf_safe_private.validate_ambrose(jsonb,jsonb,text,integer,jsonb),golf_safe_private.assert_event_complete(uuid,jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION golf_safe_private.guard_player(data jsonb, old_data jsonb, plan jsonb, pid text, day_no integer, cards jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare h text;rec jsonb;target text;marker jsonb;putting boolean;ambrose boolean;method text=coalesce(plan->'scoringMethods'->>('day'||day_no),'holeByHole');
begin
 putting=golf_safe_private.competition_on(plan,'teamPutts',day_no);
 ambrose=golf_safe_private.competition_on(plan,'ambrose',day_no);
 if coalesce((data->'_meta'->>'emergencyFinalised')::boolean,false) and data->'_meta'->'emergencyFinalised' is distinct from old_data->'_meta'->'emergencyFinalised' then raise exception 'Organiser acceptance required' using errcode='42501';end if;
 if ambrose then perform golf_safe_private.validate_ambrose(data,plan,pid,day_no,cards);return;end if;
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
$function$
;
CREATE OR REPLACE FUNCTION golf_safe_private.validate_substitution(before_plan jsonb, after_plan jsonb, cards jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare slot text; history jsonb; prior jsonb; addition jsonb; first_day integer; previous_count integer; d integer;
begin
 if coalesce(before_plan->'playerSubstitutions','{}')=coalesce(after_plan->'playerSubstitutions','{}') then return;end if;
 if jsonb_typeof(after_plan->'playerSubstitutions') is distinct from 'object' then raise exception 'Substitution history cannot be removed';end if;
 for slot,prior in select key,value from jsonb_each(coalesce(before_plan->'playerSubstitutions','{}')) loop
  if not (after_plan->'playerSubstitutions' ? slot) then raise exception 'Substitution history cannot be removed';end if;
 end loop;
 for slot,history in select key,value from jsonb_each(after_plan->'playerSubstitutions') loop
  prior=coalesce(before_plan->'playerSubstitutions'->slot,'[]');
  if history=prior then continue;end if;
  if jsonb_typeof(history) is distinct from 'array' or jsonb_typeof(prior) is distinct from 'array' then raise exception 'Invalid substitution history';end if;
  previous_count=jsonb_array_length(prior);
  if jsonb_array_length(history)<>previous_count+1 or (select coalesce(jsonb_agg(value order by ord),'[]') from jsonb_array_elements(history) with ordinality h(value,ord) where ord<=previous_count) is distinct from prior then raise exception 'Earlier substitution history is immutable';end if;
  addition=history->previous_count; first_day=(addition->>'fromDay')::integer;
  if coalesce((before_plan->>'locked')::boolean,false) is not true or first_day is null or first_day not between 1 and (before_plan->>'days')::integer or (previous_count>0 and first_day<=(prior->(previous_count-1)->>'fromDay')::integer) then raise exception 'Invalid substitution round';end if;
  if length(trim(coalesce(addition->'replacement'->>'name','')))=0 or length(addition->'replacement'->>'name')>120 or nullif(addition->'replacement'->>'id','') is null or (addition->'replacement'->>'ga')::numeric not between -10 and 54 or addition->'replacement'->>'ga' is null then raise exception 'Invalid substitute identity or handicap';end if;
  if not exists(select 1 from jsonb_array_elements_text(coalesce(before_plan->'dayFields'->('day'||first_day),before_plan->'confirmed','[]')) value where value=slot) then raise exception 'Substitution position is outside the round';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(cards,'[]')) c where (c->>'day')::integer>=first_day and nullif(c->'score_data'->'_finalScore'->>'confirmedAt','') is not null) then raise exception 'Final total already accepted in an affected round';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(cards,'[]')) c cross join lateral jsonb_each(c->'score_data') h where (c->>'day')::integer>=first_day and h.key ~ '^([1-9]|1[0-8])$' and (nullif(h.value->'self'->>'gross','') is not null or nullif(h.value->'self'->>'putts','') is not null or nullif(h.value->'official'->>'gross','') is not null or nullif(h.value->'official'->>'putts','') is not null)) then raise exception 'Scoring has begun in an affected round. Substitution blocked.';end if;
  for d in first_day..(before_plan->>'days')::integer loop
   if coalesce(before_plan->'manualScorecards'->('day'||d)->'groups','{}')<>'{}'::jsonb then raise exception 'Paper card entry has begun in an affected round';end if;
  end loop;
  for d in 1..first_day-1 loop
   if before_plan->'dailyHandicaps'->('day'||d) is distinct from after_plan->'dailyHandicaps'->('day'||d) or before_plan->'teeHandicaps'->('day'||d) is distinct from after_plan->'teeHandicaps'->('day'||d) then raise exception 'Earlier round handicaps cannot change during substitution';end if;
  end loop;
  if before_plan->'groupSetup' is distinct from after_plan->'groupSetup' or before_plan->'dayFields' is distinct from after_plan->'dayFields' or before_plan->'capTeams' is distinct from after_plan->'capTeams' then raise exception 'Substitution must keep the existing event positions';end if;
 end loop;
end;$function$
;
CREATE OR REPLACE FUNCTION public.golf_safe_away_save(p_kind text, p_event_id uuid, p_day integer, p_player_id text, p_data jsonb, p_expected_revision bigint, p_correction boolean DEFAULT false, p_reason text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.away_events;old_row public.away_round_scores;organiser boolean;result jsonb;cards jsonb;d integer;seal jsonb;incoming_at text;old_at text;invalidated boolean=false;
begin
 select * into e from public.away_events where id=p_event_id for update;
 organiser=public.is_away_event_organiser(p_event_id);
 if p_kind='event' then
  if not coalesce(organiser,false) then raise exception 'Organiser access required' using errcode='42501';end if;
  if e.revision is distinct from p_expected_revision then raise exception 'Event changed' using errcode='40001';end if;
  if e.event_data->'event'->>'publicationId' is not null then p_data=jsonb_set(p_data,'{event,publicationId}',e.event_data->'event'->'publicationId');end if;
  if p_status='archived' and e.status<>'archived' and exists(select 1 from golf_safe_private.conflicts where event_id=p_event_id and resolved_at is null) then raise exception 'Review saved copies before archiving this event' using errcode='42501';end if;
  if jsonb_typeof(p_data->'event') is distinct from 'object' or pg_column_size(p_data)>1500000 then raise exception 'Invalid event';end if;
  if jsonb_typeof(p_data->'players') is distinct from 'array' or (select count(distinct value->>'id') from jsonb_array_elements(p_data->'players'))<>jsonb_array_length(p_data->'players') then raise exception 'Invalid player roster';end if;
  if exists(select 1 from public.away_round_scores where event_id=p_event_id and scorer_player_id not in(select value->>'id' from jsonb_array_elements(p_data->'players'))) then raise exception 'Players with saved scores cannot be removed';end if;
  for d in 1..coalesce((e.event_data->'event'->>'days')::integer,1) loop
   if golf_safe_private.scoring_started(p_event_id,d) and (golf_safe_private.round_settings(e.event_data->'event',d) is distinct from golf_safe_private.round_settings(p_data->'event',d) or e.event_data->'courses' is distinct from p_data->'courses') then raise exception 'Scoring has begun: round identity, handicap, course, tee and start settings are locked' using errcode='42501';end if;
  end loop;
  incoming_at=p_data->'event'->'finalResults'->>'confirmedAt';old_at=e.event_data->'event'->'finalResults'->>'confirmedAt';
  if old_at is not null and (incoming_at is null or incoming_at=old_at) and (
    p_data->'event'->'manualScorecards' is distinct from e.event_data->'event'->'manualScorecards' or
    p_data->'event'->'organiserCorrections' is distinct from e.event_data->'event'->'organiserCorrections' or
    p_data->'event'->'competitions' is distinct from e.event_data->'event'->'competitions' or
    p_data->'event'->'competitionDays' is distinct from e.event_data->'event'->'competitionDays' or
    p_data->'event'->'finalScores' is distinct from e.event_data->'event'->'finalScores') then
    p_data=jsonb_set(jsonb_set(p_data,'{event,lastFinalResults}',e.event_data->'event'->'finalResults')#-'{event,finalResults}','{event,status}','"locked"');
    incoming_at=null;invalidated=true;if coalesce(p_status,e.status)<>'archived' then p_status='locked';end if;
  end if;

  if old_at is not null and incoming_at is null and not invalidated then
   p_data=jsonb_set(p_data,'{event,finalResults}',e.event_data->'event'->'finalResults');incoming_at=old_at;
  end if;
  if incoming_at is not null then
   if incoming_at is distinct from old_at then
    if incoming_at=e.event_data->'event'->'lastFinalResults'->>'confirmedAt' then raise exception 'Results changed. Review and confirm again with a new sign-off';end if;
    seal=golf_safe_private.assert_event_complete(p_event_id,p_data);
    if not (p_data->'event'->'finalResults' ? 'expectedScoreRevisions') then raise exception 'Refresh Away Golf before confirming final results' using errcode='22023';end if;
    if p_data->'event'->'finalResults'->'expectedScoreRevisions' is distinct from seal then raise exception 'Scorecards changed. Reload and review results before sign-off' using errcode='40001';end if;
    p_data=jsonb_set(p_data,'{event,finalResults}',((p_data->'event'->'finalResults')-'expectedScoreRevisions')||jsonb_build_object('confirmedBy',auth.uid(),'acceptedScoreRevisions',seal,'cloudAcceptedAt',clock_timestamp()));
   else
    p_data=jsonb_set(p_data,'{event,finalResults}',e.event_data->'event'->'finalResults');
   end if;
   p_data=jsonb_set(p_data,'{event,status}','"complete"');
   if coalesce(p_status,e.status)<>'archived' then p_status='complete';end if;
  elsif p_data->'event'->>'status' in ('complete','completed') and e.event_data->'event'->'finalResults' is null then
   raise exception 'Final sign-off is required to close the event';
  end if;
  perform golf_safe_private.validate_substitution(e.event_data->'event',p_data->'event',(select coalesce(jsonb_agg(jsonb_build_object('day',day,'score_data',score_data)),'[]') from public.away_round_scores where event_id=p_event_id));
  perform golf_safe_private.validate_shared_positions(e.event_data->'event',p_data->'event',p_data->'players',least(16,(p_data->'event'->>'fieldSize')::integer));
  insert into public.away_event_players(event_id,player_id,display_name,player_data) select p_event_id,value->>'id',coalesce(value->>'name','Player'),value-'id'-'name' from jsonb_array_elements(p_data->'players') on conflict(event_id,player_id) do update set display_name=excluded.display_name,player_data=excluded.player_data;
  delete from public.away_event_players where event_id=p_event_id and player_id not in(select value->>'id' from jsonb_array_elements(p_data->'players'));
  insert into golf_safe_private.corrections(event_id,actor,reason,before_data,after_data) values(p_event_id,auth.uid(),'Organiser event plan update',e.event_data,p_data);
  update public.away_events set event_data=p_data,name=coalesce(p_data->'event'->>'name',name),status=coalesce(p_status,status) where id=p_event_id returning jsonb_build_object('id',id,'join_code',join_code,'revision',revision,'updated_at',updated_at) into result;return result||jsonb_build_object('saved_data',p_data);
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
 if not coalesce(organiser,false) and not golf_safe_private.scoring_is_open(e.event_data->'event',p_day) then raise exception 'Scoring has not opened yet' using errcode='42501';end if;
 perform golf_safe_private.validate_score(p_data,e.event_data->'event',p_player_id,p_day,coalesce(organiser,false));
 if not coalesce(organiser,false) then
  select jsonb_object_agg(scorer_player_id,score_data) into cards from public.away_round_scores where event_id=p_event_id and day=p_day;
  perform golf_safe_private.guard_player(p_data,old_row.score_data,(e.event_data->'event') || jsonb_build_object('_scoreAcceptanceCourses',e.event_data->'courses'),p_player_id,p_day,coalesce(cards,'{}'));
 end if;

 insert into public.away_round_scores(event_id,day,scorer_player_id,score_data) values(p_event_id,p_day,p_player_id,p_data) on conflict(event_id,day,scorer_player_id) do update set score_data=excluded.score_data returning jsonb_build_object('revision',revision,'updated_at',updated_at) into result;
 if e.event_data->'event'->'finalResults'->>'confirmedAt' is not null then
  update public.away_events set event_data=jsonb_set(jsonb_set(event_data,'{event,lastFinalResults}',event_data->'event'->'finalResults')#-'{event,finalResults}','{event,status}','"locked"'),status=case when status='archived' then 'archived' else 'locked' end where id=p_event_id;
 end if;
 return result;
end;$function$
;
create unique index if not exists away_event_publication_identity on public.away_events(organiser_id,(event_data->'event'->>'publicationId')) where event_data->'event'->>'publicationId' is not null;
CREATE OR REPLACE FUNCTION public.create_away_event(p_name text, p_event_data jsonb, p_players jsonb)
 RETURNS TABLE(event_id uuid, join_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event_id uuid;
  v_code text;
  v_player jsonb;
  publication text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Event name is required'; end if;
  if jsonb_typeof(coalesce(p_players, '[]'::jsonb)) <> 'array' then
    raise exception 'Players must be an array';
  end if;

  publication=nullif(p_event_data->'event'->>'publicationId','');
  if publication is not null then
    if length(publication)>100 then raise exception 'Invalid publication identity';end if;
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||publication,0));
    select e.id,e.join_code into v_event_id,v_code from public.away_events e where e.organiser_id=auth.uid() and e.event_data->'event'->>'publicationId'=publication;
    if v_event_id is not null then
      if exists(select 1 from public.away_events where id=v_event_id and status in ('complete','archived')) then raise exception 'This publication is closed. Duplicate it as a new event plan.';end if;
      return query select v_event_id,v_code;return;
    end if;
  end if;
  if nullif(p_event_data->'event'->'finalResults'->>'confirmedAt','') is not null or p_event_data->'event'->>'status' in ('complete','completed','archived') then raise exception 'Publish the event before final sign-off';end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.away_events e where e.join_code = v_code);
  end loop;

  insert into public.away_events(join_code, organiser_id, name, event_data)
  values (v_code, auth.uid(), trim(p_name), coalesce(p_event_data, '{}'::jsonb))
  returning id into v_event_id;

  for v_player in select value from jsonb_array_elements(coalesce(p_players, '[]'::jsonb))
  loop
    insert into public.away_event_players(event_id, player_id, display_name, player_data)
    values (
      v_event_id,
      v_player->>'id',
      coalesce(nullif(trim(v_player->>'name'), ''), 'Player'),
      v_player - 'id' - 'name'
    );
  end loop;

  return query select v_event_id, v_code;
end;
$function$
;
revoke all on function golf_safe_private.guard_player(jsonb,jsonb,jsonb,text,integer,jsonb),golf_safe_private.validate_substitution(jsonb,jsonb,jsonb) from public,anon,authenticated;

revoke all on function public.create_away_event(text,jsonb,jsonb),public.golf_safe_away_save(text,uuid,integer,text,jsonb,bigint,boolean,text,text) from public,anon;
grant execute on function public.create_away_event(text,jsonb,jsonb),public.golf_safe_away_save(text,uuid,integer,text,jsonb,bigint,boolean,text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.is_away_event_organiser(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.away_events e
    where e.id = p_event_id and e.organiser_id = auth.uid()
  ) or exists (
    select 1 from public.away_event_organisers eo
    where eo.event_id = p_event_id
      and eo.user_id = auth.uid()
      and eo.revoked_at is null
      and (eo.access_type<>'guest' or exists(select 1 from public.away_events ge where ge.id=eo.event_id and ge.status not in ('complete','archived') and coalesce(ge.event_data->'event'->>'status','') not in ('complete','completed','archived') and nullif(ge.event_data->'event'->'finalResults'->>'confirmedAt','') is null))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.away_guest_organiser_active(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.away_event_organisers eo
    join public.away_events e on e.id = eo.event_id
    where eo.event_id = p_event_id
      and eo.user_id = auth.uid()
      and eo.access_type = 'guest'
      and eo.revoked_at is null
      and e.status not in ('complete', 'archived')
      and coalesce(e.event_data->'event'->>'status','') not in ('complete','completed','archived')
      and nullif(e.event_data->'event'->'finalResults'->>'confirmedAt','') is null
  );
$function$
;

CREATE OR REPLACE FUNCTION public.create_away_guest_organiser_key(p_event_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_code text;
begin
  if not exists (
    select 1 from public.away_events e
    where e.id = p_event_id and e.organiser_id = auth.uid() and e.status not in ('complete','archived') and coalesce(e.event_data->'event'->>'status','') not in ('complete','completed','archived') and nullif(e.event_data->'event'->'finalResults'->>'confirmedAt','') is null
  ) then
    raise exception 'Only the Owner Organiser can delegate an event';
  end if;

  -- One delegated planner at a time. Creating a replacement invitation
  -- immediately retires any earlier Guest Organiser for this event.
  update public.away_event_organisers
  set revoked_at = coalesce(revoked_at, now())
  where event_id = p_event_id and access_type = 'guest';

  v_code := upper(substr(encode(gen_random_bytes(10), 'hex'), 1, 10));
  insert into public.away_event_guest_keys(event_id, access_hash, created_at, expires_at)
  values (p_event_id, crypt(v_code, gen_salt('bf')), now(), now() + interval '14 days')
  on conflict (event_id) do update set
    access_hash = excluded.access_hash,
    created_at = now(),
    expires_at = now() + interval '14 days';
  return v_code;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_away_guest_organiser_access(p_join_code text, p_access_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_event_id uuid;
  v_hash text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;

  -- A network interruption after a successful claim must not strand the
  -- guest merely because the one-use invitation key has already been removed.
  select e.id into v_event_id
  from public.away_events e
  join public.away_event_organisers eo on eo.event_id = e.id
  where e.join_code = upper(trim(p_join_code))
    and eo.user_id = auth.uid()
    and eo.access_type = 'guest'
    and eo.revoked_at is null
    and e.status not in ('complete', 'archived')
      and coalesce(e.event_data->'event'->>'status','') not in ('complete','completed','archived')
      and nullif(e.event_data->'event'->'finalResults'->>'confirmedAt','') is null
  limit 1;
  if v_event_id is not null then return v_event_id; end if;

  select e.id, k.access_hash into v_event_id, v_hash
  from public.away_events e
  join public.away_event_guest_keys k on k.event_id = e.id
  where e.join_code = upper(trim(p_join_code))
    and e.status not in ('complete', 'archived')
      and coalesce(e.event_data->'event'->>'status','') not in ('complete','completed','archived')
      and nullif(e.event_data->'event'->'finalResults'->>'confirmedAt','') is null
    and k.expires_at > now()
  order by e.updated_at desc
  limit 1;

  if v_event_id is null or crypt(upper(trim(p_access_code)), v_hash) <> v_hash then
    raise exception 'The event code or Guest Organiser code is incorrect or expired';
  end if;

  insert into public.away_event_organisers(event_id, user_id, access_type, revoked_at)
  values (v_event_id, auth.uid(), 'guest', null)
  on conflict (event_id, user_id) do update set
    access_type = 'guest', revoked_at = null, granted_at = now();

  delete from public.away_event_guest_keys where event_id = v_event_id;
  return v_event_id;
end;
$function$
;

create or replace function public.away_revoke_guests_when_event_closes()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('complete','archived') or coalesce(new.event_data->'event'->>'status','') in ('complete','completed','archived') or nullif(new.event_data->'event'->'finalResults'->>'confirmedAt','') is not null then
   update public.away_event_organisers set revoked_at=coalesce(revoked_at,now()) where event_id=new.id and access_type='guest';
   delete from public.away_event_guest_keys where event_id=new.id;
 end if;return new;
end;$$;
revoke all on function public.away_revoke_guests_when_event_closes() from public,anon,authenticated,service_role;
drop trigger if exists away_event_revoke_guests on public.away_events;
create trigger away_event_revoke_guests after update of status,event_data on public.away_events for each row execute function public.away_revoke_guests_when_event_closes();
revoke all on function public.is_away_event_organiser(uuid),public.away_guest_organiser_active(uuid),public.create_away_guest_organiser_key(uuid),public.claim_away_guest_organiser_access(text,text) from public,anon;
grant execute on function public.is_away_event_organiser(uuid),public.away_guest_organiser_active(uuid),public.create_away_guest_organiser_key(uuid),public.claim_away_guest_organiser_access(text,text) to authenticated;
