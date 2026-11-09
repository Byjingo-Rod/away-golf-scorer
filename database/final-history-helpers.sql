-- Pure helpers: no network, no production-row updates, no caller privileges.
create or replace function golf_safe_private.awarded_field(p jsonb,d integer) returns setof text
language sql immutable set search_path='' as $$
 select id from jsonb_array_elements_text(coalesce(p->'dayFields'->('day'||d),p->'confirmed','[]')) t(id)
 where id<>'system-no-partner' and id<>coalesce(p->'emergencyReplacements'->('day'||d)->>'missingPlayerId','')
 and (p->'dayFields'->('day'||d) is not null or coalesce(p->'dayAvailability'->id->>d::text,'true')<>'false');
$$;
create or replace function golf_safe_private.awarded_profile(p jsonb,pid text,d integer) returns text
language plpgsql immutable set search_path='' as $$
declare person text=pid;r jsonb;
begin
 if jsonb_array_length(coalesce(p->'playerSubstitutions'->pid,'[]'))>0 then
  person=p->'playerSubstitutions'->pid->0->'previous'->>'id';
  for r in select value from jsonb_array_elements(p->'playerSubstitutions'->pid) loop
   if (r->>'fromDay')::integer<=d then person=r->'replacement'->>'id';end if;
  end loop;
 end if;return person;
end;$$;
create or replace function golf_safe_private.awarded_points(p jsonb,courses jsonb,cards jsonb,pid text,d integer) returns integer
language plpgsql immutable set search_path='' as $$
declare c jsonb;card jsonb;entry jsonb;r jsonb;v jsonb;category text='men';tee text;idx text;primary_idx integer;hcp integer;shots integer;extra integer;par integer;h integer;total integer=0;g text;gi integer=0;
begin
 if coalesce(p->'scoringMethods'->>('day'||d),'holeByHole')='finalGross' or golf_safe_private.competition_on(p,'ambrose',d) then return null;end if;
 entry=coalesce(cards->pid->'_finalScore',p->'finalScores'->('day'||d)->pid);
 if entry->>'kind'='stableford' and nullif(entry->>'confirmedAt','') is not null then return (entry->>'total')::integer;end if;
 for r in select value from jsonb_array_elements(coalesce(p->'groupSetup'->('day'||d)->'groups','[]')) loop
  if r ? pid then
   entry=p->'manualScorecards'->('day'||d)->'groups'->gi::text;
   if entry->>'status'='submitted' and nullif(entry->'players'->pid->'single'->>'total','') is not null then return (entry->'players'->pid->'single'->>'total')::integer;end if;
   exit;
  end if;gi=gi+1;
 end loop;
 if coalesce(p->>'courseCategoryVersion','') not in ('','0','false') and p->'gaCategories'->>pid='women' then category='women';end if;
 tee=coalesce(nullif(p->'teeSelectionByCategory'->('day'||d)->>category,''),nullif(p->'teeSelection'->>('day'||d),''),'middle');
 select value into c from jsonb_array_elements(courses) where value->>'id'=p->>('course'||d);
 if category='women' then c=c->'womenTeeData';end if;
 card=c->'teeScorecards'->tee;
 if card is null then select value into card from jsonb_array_elements(coalesce(c->'versions','[]')) where value->>'id'=c->>'activeVersionId' limit 1;card=coalesce(card,c->'versions'->0);end if;
 if p->'courseLayouts'->('day'||d) is not null then card=golf_safe_private.layout_card(card,p->'courseLayouts'->('day'||d),category||':'||tee);end if;
 hcp=coalesce(nullif(p->'teeHandicaps'->('day'||d)->tee->>pid,'')::integer,nullif(p->'dailyHandicaps'->('day'||d)->>pid,'')::integer);
 if hcp is null or card is null then return null;end if;
 for h in 1..18 loop
  entry=p->'organiserCorrections'->('day'||d)->pid->h::text;
  if nullif(entry->>'gross','') is null then
   select value->h::text->'official' into entry from jsonb_each(cards) where value->h::text->'official'->>'playerId'=pid and nullif(value->h::text->'official'->>'gross','') is not null limit 1;
  end if;
  g=entry->>'gross';par=nullif(card->'par'->>(h-1),'')::integer;idx=card->'index'->>(h-1);
  if g is null or par is null or idx is null then return null;end if;
  if upper(g)='P' then continue;end if;
  primary_idx=split_part(idx,'/',1)::integer;shots=0;
  if hcp<0 then shots=-(abs(hcp)/18)-case when primary_idx>18-(abs(hcp)%18) then 1 else 0 end;
  elsif hcp>0 and position('/' in idx)>0 then
   select count(*)::integer into shots from unnest(string_to_array(idx,'/')) x where btrim(x)::integer>0 and btrim(x)::integer<=hcp;
   if hcp>36 and not (p->'finalResults'->>'confirmedAt' is not null and coalesce(p->'finalResults'->>'scoringRulesVersion','')<>'2') then extra=hcp-36;shots=shots+extra/18+case when primary_idx<=extra%18 then 1 else 0 end;end if;
  elsif hcp>0 then shots=hcp/18+case when primary_idx<=hcp%18 then 1 else 0 end;end if;
  total=total+greatest(0,2+par+shots-g::integer);
 end loop;return total;
end;$$;
create or replace function golf_safe_private.validate_awarded_snapshot(p jsonb,courses jsonb,all_cards jsonb,s jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare d integer;r jsonb;person jsonb;pid text;points integer;eligible boolean;expected_count integer;comp jsonb;label text;winners jsonb;cid text;types text[];
begin
 if s->>'version' is distinct from '2' or jsonb_typeof(s->'rounds') is distinct from 'array' or jsonb_typeof(s->'competitions') is distinct from 'array' then raise exception 'Update the app before finishing this event';end if;
 if jsonb_array_length(s->'rounds')<>coalesce((p->>'days')::integer,1) then raise exception 'Every event day must be retained';end if;
 for d in 1..coalesce((p->>'days')::integer,1) loop
  if (select count(*) from jsonb_array_elements(s->'rounds') x where (x->>'day')::integer=d)<>1 then raise exception 'Missing or duplicate retained day';end if;
  select value into r from jsonb_array_elements(s->'rounds') where (value->>'day')::integer=d;
  if r->>'date' is distinct from coalesce(nullif(p->'dayDates'->>('day'||d),''),((p->>'date')::date+d-1)::text) or jsonb_typeof(r->'eligible') is distinct from 'boolean' or jsonb_typeof(r->'players') is distinct from 'array' then raise exception 'Invalid retained round';end if;
  eligible=not golf_safe_private.competition_on(p,'ambrose',d) and coalesce(p->'scoringMethods'->>('day'||d),'holeByHole')<>'finalGross';
  expected_count=0;
  for pid in select * from golf_safe_private.awarded_field(p,d) loop
   expected_count=expected_count+1;points=golf_safe_private.awarded_points(p,courses,coalesce(all_cards->d::text,'{}'),pid,d);
   if points is null then eligible=false;end if;
   if (r->>'eligible')::boolean then
    if (select count(*) from jsonb_array_elements(r->'players') x where x->>'sourceId'=pid)<>1 then raise exception 'Missing or duplicate accepted player';end if;
    select value into person from jsonb_array_elements(r->'players') where value->>'sourceId'=pid;
    if person->>'id' is distinct from golf_safe_private.awarded_profile(p,pid,d) or jsonb_typeof(person->'points') is distinct from 'number' or (person->>'points')::numeric is distinct from points::numeric then raise exception 'Retained Stableford points differ from accepted scores';end if;
   end if;
  end loop;
  if expected_count=0 then eligible=false;end if;
  if eligible is distinct from (r->>'eligible')::boolean or jsonb_array_length(r->'players')<>(case when eligible then expected_count else 0 end) then raise exception 'Individual history eligibility does not match accepted cards';end if;
 end loop;
 if (select count(distinct x->>'id') from jsonb_array_elements(s->'competitions') x)<>jsonb_array_length(s->'competitions') then raise exception 'Duplicate retained competition';end if;
 for comp in select value from jsonb_array_elements(s->'competitions') loop
  if nullif(comp->>'id','') is null or comp->'definition'->>'id' is distinct from comp->>'id' or comp->'definition'->>'type' is distinct from comp->>'type' or (comp->'result'->>'complete') is distinct from 'true' or jsonb_typeof(comp->'rows') is distinct from 'array' or jsonb_typeof(comp->'winnerIds') is distinct from 'array' then raise exception 'Incomplete retained prize leaderboard';end if;
  if comp->>'type'='single' then
   d=(comp->'definition'->>'day')::integer;
   select value into r from jsonb_array_elements(s->'rounds') where (value->>'day')::integer=d;
   if r is null or (r->>'eligible') is distinct from 'true' or jsonb_array_length(comp->'rows')<>jsonb_array_length(r->'players') then raise exception 'Daily leaderboard does not match accepted players';end if;
   for person in select value from jsonb_array_elements(r->'players') loop
    if (select count(*) from jsonb_array_elements(comp->'rows') x where x->>'id'=person->>'sourceId' and x->'total'=person->'points')<>1 then raise exception 'Daily leaderboard points differ from accepted cards';end if;
   end loop;
  end if;
  label=comp->>'label';
  select coalesce(jsonb_agg(key order by key),'[]') into winners from jsonb_each(coalesce(p->'finalResults'->'outcomes','{}')) where value ? label;
  if winners is distinct from (select coalesce(jsonb_agg(value order by value),'[]') from jsonb_array_elements_text(comp->'winnerIds')) then raise exception 'Retained prize winners differ from the original sign-off';end if;
 end loop;
 for label in select distinct jsonb_array_elements_text(value) from jsonb_each(coalesce(p->'finalResults'->'outcomes','{}')) loop
  if not exists(select 1 from jsonb_array_elements(s->'competitions') x where x->>'label'=label) then raise exception 'An awarded prize is missing';end if;
 end loop;
 for cid in select jsonb_array_elements_text(coalesce(p->'competitions','[]')) loop
  types=case cid when 'single' then array['single','combined'] when 'combined' then array['single','combined'] when 'teamPutts' then array['putts'] when 'best3of4' then array['best3'] when 'scratch' then array['scratch','scratchaggregate'] when 'stroke' then array['strokeNet','strokeGross','strokeAggregateNet','strokeAggregateGross'] when 'par3' then array['par3','par3team','par3aggregate','par3individualaggregate'] else array[cid] end;
  if not exists(select 1 from jsonb_array_elements(s->'competitions') x where x->>'type'=any(types)) then raise exception 'A selected competition is missing from retained results';end if;
  if cid=any(array['single','combined','fourball','teamPutts','best3of4','yellowBall','ntp','ambrose']) then
   for d in 1..coalesce((p->>'days')::integer,1) loop
    if golf_safe_private.competition_on(p,cid,d) and not exists(select 1 from jsonb_array_elements(s->'competitions') x where x->>'type'=any(types) and (x->'definition'->>'day')::integer=d) then raise exception 'A selected daily result is missing';end if;
   end loop;
  end if;
 end loop;
end;$$;
create or replace function golf_safe_private.compact_awarded_document(doc jsonb,snapshot jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('event',coalesce((select jsonb_object_agg(key,value) from jsonb_each(doc->'event') where key=any(array[
 'name','date','dayDates','timeZone','days','fieldSize','confirmed','dayFields','dayAvailability','gaCategories','dailyHandicaps','teeHandicaps','courseCategoryVersion','course1','course2','course3','course4','course5','course6','course7','teeSelection','teeSelectionByCategory','courseLayouts','groupSetup','sharedPositions','playerSubstitutions','emergencyReplacements','competitions','competitionDays','scoringMethods','manualScorecards','finalScores','organiserCorrections','finalResults','historyRecordedAt','historyBaseline','handicapHistoryRecordedAt','specialRules','benefits','startMode','startHole','startHoles','firstTeeTime','teeInterval','teeIntervals','puttingFormat','scratchFormat','scratchMaxHcp','scratchScoringMode','scratchCountingRounds','strokeCountingMode','strokeDailyResults','strokeAggregateEnabled','strokeAggregateMode','strokeScoringMode','singleStablefordFormat','stablefordCountingRounds','countingRounds','fourballFormat','par3Mode','par3Format','eclecticGroups','capTeams','ambroseMinimumDrives','ambroseScoringMode','ambroseRoleAssignments','ntpSelections','ntpDay1Count','ntpDay2Count','ntpJackpot','ntpJackpotFormat','yellowBallDays','yellowBallRotation','yellowBallLost','yellowBallRules'
 ])),'{}')||jsonb_build_object('awardedResults',snapshot,'locked',true,'status','completed','retentionSchema',2),
 'players',coalesce((select jsonb_agg(jsonb_build_object('id',x->>'id','name',x->>'name','gaCategory',x->>'gaCategory')) from jsonb_array_elements(coalesce(doc->'players','[]')) x),'[]'),
 'courses',coalesce(doc->'courses',doc->'courseSnapshots',doc->'event'->'courseSnapshot','[]'));
$$;
revoke all on function golf_safe_private.awarded_field(jsonb,integer),golf_safe_private.awarded_profile(jsonb,text,integer),golf_safe_private.awarded_points(jsonb,jsonb,jsonb,text,integer),golf_safe_private.validate_awarded_snapshot(jsonb,jsonb,jsonb,jsonb),golf_safe_private.compact_awarded_document(jsonb,jsonb) from public,anon,authenticated;
