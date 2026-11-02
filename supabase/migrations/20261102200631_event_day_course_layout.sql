-- Event-only layout overlays; no master catalogue writes or new public RPCs.
create or replace function golf_safe_private.layout_sequence(l jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare seq jsonb;next_seq jsonb;c jsonb;h jsonb;idx int;pos int;out_h int;replacement int;
begin
 select jsonb_agg(jsonb_build_object('physical',i,'eclectic',i) order by i) into seq from generate_series(1,18)i;
 if l is null then return seq;end if;
 if jsonb_typeof(l->'changes') is distinct from 'array' or jsonb_array_length(l->'changes') not between 1 and 18 then raise exception 'Invalid course layout changes';end if;
 for c in select value from jsonb_array_elements(l->'changes') loop
  if coalesce(c->>'out','') !~ '^[0-9]{1,2}$' or coalesce(c->>'replacement','') !~ '^[0-9]{1,2}$' or coalesce(c->>'placement','') not in ('keep','before','after') or coalesce(c->>'indexMode','') not in ('inherit','club') or coalesce(c->>'ratingMode','') not in ('retain','club') then raise exception 'Invalid course layout instruction';end if;
  out_h=(c->>'out')::int;replacement=(c->>'replacement')::int;
  select ordinality::int-1,value into idx,h from jsonb_array_elements(seq) with ordinality where (value->>'physical')::int=out_h;
  if idx is null or replacement not between 1 and 99 or exists(select 1 from jsonb_array_elements(seq) where (value->>'physical')::int=replacement and (value->>'physical')::int<>out_h) then raise exception 'Invalid or duplicate physical replacement hole';end if;
  next_seq=seq-idx;pos=idx;
  if c->>'placement'<>'keep' then
   if coalesce(c->>'beside','') !~ '^[0-9]{1,2}$' then raise exception 'Choose a remaining physical course hole';end if;
   select ordinality::int-1 into pos from jsonb_array_elements(next_seq) with ordinality where value->>'physical'=c->>'beside';
   if pos is null then raise exception 'Replacement position is not beside a remaining hole';end if;
   if c->>'placement'='after' then pos=pos+1;end if;
  end if;
  seq=jsonb_insert(next_seq,array[pos::text],jsonb_build_object('physical',replacement,'eclectic',h->'eclectic'));
 end loop;
 return seq;
end;$$;
create or replace function golf_safe_private.layout_indexes(a jsonb) returns void language plpgsql immutable set search_path='' as $$
declare v text;primary_indexes int[]='{}';secondary_indexes int[]='{}';
begin
 if jsonb_typeof(a) is distinct from 'array' or jsonb_array_length(a)<>18 then raise exception 'All 18 indexes are required';end if;
 for v in select jsonb_array_elements_text(a) loop
  if coalesce(v,'') !~ '^[0-9]+(/[0-9]+)?$' then raise exception 'Invalid stroke index';end if;
  primary_indexes=array_append(primary_indexes,split_part(v,'/',1)::int);
  if position('/' in v)>0 then secondary_indexes=array_append(secondary_indexes,split_part(v,'/',2)::int);end if;
 end loop;
 if (select count(distinct n) from unnest(primary_indexes)n where n between 1 and 18)<>18 then raise exception 'Primary indexes must contain 1 to 18 exactly once';end if;
 if cardinality(secondary_indexes)>0 and (cardinality(secondary_indexes)<>18 or (select count(distinct n) from unnest(secondary_indexes)n where n between 19 and 36)<>18) then raise exception 'Second indexes must contain 19 to 36 exactly once or be omitted';end if;
end;$$;
create or replace function golf_safe_private.layout_card(base jsonb,l jsonb,k text) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb=base;seq jsonb;next_seq jsonb;c jsonb;prefix jsonb='[]';d jsonb;f text;a jsonb;h jsonb;idx int;out_idx int;cell jsonb;distance numeric;
begin
 if l is null then return base;end if;
 seq=golf_safe_private.layout_sequence(null);
 for c in select value from jsonb_array_elements(l->'changes') loop
  prefix=prefix||jsonb_build_array(c);next_seq=golf_safe_private.layout_sequence(jsonb_build_object('changes',prefix));
  select ordinality::int-1 into out_idx from jsonb_array_elements(seq) with ordinality where value->>'physical'=c->>'out';
  d=c->'details'->k;
  if coalesce(d->>'par','') !~ '^[3-6]$' then raise exception 'Replacement par is required for %',k;end if;
  distance=nullif(btrim(d->>'length'),'')::numeric;
  if distance is not null and (distance<=0 or distance>2000) then raise exception 'Length must be blank or positive, up to 2000 metres';end if;
  foreach f in array array['par','index','metres','yards'] loop
   if f='yards' and not result ? 'yards' then continue;end if;
   a='[]';
   for h in select value from jsonb_array_elements(next_seq) loop
    if h->>'physical'=c->>'replacement' then
     cell=case f when 'par' then to_jsonb((d->>'par')::int) when 'metres' then coalesce(to_jsonb(distance),'""') when 'yards' then coalesce(to_jsonb(round(distance/0.9144)),'""') else result->f->out_idx end;
    else
     select ordinality::int-1 into idx from jsonb_array_elements(seq) with ordinality where value->>'physical'=h->>'physical';
     cell=result->f->idx;
    end if;
    a=a||jsonb_build_array(coalesce(cell,'""'));
   end loop;
   result=jsonb_set(result,array[f],a);
  end loop;
  if c->>'indexMode'='club' then result=jsonb_set(result,'{index}',coalesce(c->'indexes'->k,'[]'));end if;
  perform golf_safe_private.layout_indexes(result->'index');seq=next_seq;
 end loop;
 return result;
end;$$;
create or replace function golf_safe_private.layout_validate(plan jsonb,courses jsonb) returns void language plpgsql immutable set search_path='' as $$
declare entry record;d int;l jsonb;c jsonb;data jsonb;card jsonb;k text;category text;tee text;change jsonb;detail jsonb;slope numeric;scratch numeric;h text;v text;pid text;actual text;
begin
 if jsonb_typeof(coalesce(plan->'courseLayouts','{}'))<>'object' or pg_column_size(coalesce(plan->'courseLayouts','{}'))>180000 then raise exception 'Invalid course layouts';end if;
 for entry in select * from jsonb_each(coalesce(plan->'courseLayouts','{}')) loop
  if entry.key !~ '^day[1-7]$' then raise exception 'Invalid layout day';end if;
  d=substring(entry.key from 4)::int;l=entry.value;
  if d>coalesce((plan->>'days')::int,0) or l->>'courseId' is distinct from plan->>('course'||d) or nullif(l->>'revision','') is null then raise exception 'Layout must belong to the selected event day and course';end if;
  perform golf_safe_private.layout_sequence(l);
  select value into c from jsonb_array_elements(courses) where value->>'id'=l->>'courseId';
  if c is null then raise exception 'Trusted base course card is missing';end if;
  for k in select distinct keys.key from jsonb_array_elements(l->'changes') ch cross join lateral jsonb_object_keys(ch->'details') keys(key) loop
   category=split_part(k,':',1);tee=split_part(k,':',2);
   if category not in ('men','women') or tee not in ('back','middle','front') then raise exception 'Invalid layout tee/category';end if;
   data=case when category='women' then c->'womenTeeData' else c end;
   card=data->'teeScorecards'->tee;
   if card is null then raise exception 'Selected layout tee has no trusted original card';end if;
   card=golf_safe_private.layout_card(card,l,k);
   if exists(select 1 from jsonb_array_elements_text(card->'par')p where p !~ '^[3-6]$') then raise exception 'Every playing hole needs a valid par';end if;
   detail=data->'teeDetails'->tee;slope=(detail->>'slope')::numeric;scratch=(detail->>'scratch')::numeric;
   for change in select value from jsonb_array_elements(l->'changes') loop
    if change->>'ratingMode'='club' then slope=(change->'ratings'->k->>'slope')::numeric;scratch=(change->'ratings'->k->>'scratch')::numeric;end if;
   end loop;
   if slope is null or scratch is null or slope not between 55 and 155 or scratch<=0 or scratch>100 then raise exception 'Confirm course rating and slope';end if;
  end loop;
  for pid in select jsonb_array_elements_text(coalesce(plan->'dayFields'->entry.key,plan->'confirmed','[]')) loop
   if pid='system-no-partner' then continue;end if;
   actual=coalesce(plan->'sharedPositions'->golf_safe_private.shared_slot(plan,pid)->>entry.key,pid);
   category=case when coalesce(plan->>'courseCategoryVersion','') not in ('','0','false') and plan->'gaCategories'->>actual='women' then 'women' else 'men' end;
   tee=coalesce(nullif(plan->'teeSelectionByCategory'->entry.key->>category,''),nullif(plan->'teeSelection'->>entry.key,''),'middle');
   data=case when category='women' then c->'womenTeeData' else c end;
   card=golf_safe_private.layout_card(data->'teeScorecards'->tee,l,category||':'||tee);
   v=coalesce(plan->'teeHandicaps'->entry.key->tee->>pid,plan->'dailyHandicaps'->entry.key->>pid);
   if coalesce(v,'') !~ '^-?[0-9]+$' or v::int not between -10 and 54 then raise exception 'Review every daily handicap for the changed layout';end if;
   for h in select jsonb_array_elements_text(coalesce(plan->'ntpSelections'->entry.key,'[]')) loop
    if h !~ '^([1-9]|1[0-8])$' or card->'par'->>((h::int)-1)<>'3' then raise exception 'Resolve NTP selections against the revised par-3 holes';end if;
   end loop;
  end loop;
  for h in select jsonb_array_elements_text(coalesce(plan->'startHoles'->entry.key,'[]')) union all select jsonb_array_elements_text(coalesce(plan->'groupSetup'->entry.key->'starts','[]')) loop
   if h !~ '^([1-9]|1[0-8])$' then raise exception 'Resolve all revised starting holes';end if;
  end loop;
 end loop;
end;$$;

CREATE OR REPLACE FUNCTION golf_safe_private.round_settings(p jsonb, d integer)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('layout',p->'courseLayouts'->('day'||d),'course',p->('course'||d),'groups',p->'groupSetup'->('day'||d)->'groups',
 'starts',p->'groupSetup'->('day'||d)->'starts','fields',coalesce(p->'dayFields'->('day'||d),p->'confirmed'),
 'tee',p->'teeSelection'->('day'||d),'categoryTees',p->'teeSelectionByCategory'->('day'||d),
 'handicaps',p->'dailyHandicaps'->('day'||d),'teeHandicaps',p->'teeHandicaps'->('day'||d),
 'startMethod',coalesce(p->'startMethods'->('day'||d),p->'startMethod'),'startHoles',coalesce(p->'startHoles'->('day'||d),p->'twoTeeStarts'->('day'||d)),
 'method',coalesce(p->'scoringMethods'->>('day'||d),'holeByHole'),'ambroseRoles',p->'ambroseRoleAssignments'->('day'||d),
 'ambroseMode',p->'ambroseScoringMode','minimumDrives',p->'ambroseMinimumDrives');
$function$
;
CREATE OR REPLACE FUNCTION golf_safe_private.layout_started(eid uuid, d integer)
 RETURNS boolean
 LANGUAGE sql
 VOLATILE
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.away_round_scores s where s.event_id=eid and s.day=d and
   (nullif(s.score_data->'_finalScore'->>'confirmedAt','') is not null or exists(
     select 1 from jsonb_each(s.score_data) h where h.key ~ '^([1-9]|1[0-8])$' and
       (nullif(h.value->'self'->>'gross','') is not null or nullif(h.value->'official'->>'gross','') is not null or nullif(h.value->'self'->>'putts','') is not null or nullif(h.value->'official'->>'putts','') is not null))))
 or exists(select 1 from public.away_events e where e.id=eid and coalesce(e.event_data->'event'->'manualScorecards'->('day'||d)->'groups','{}')<>'{}'::jsonb);
$function$
;
CREATE OR REPLACE FUNCTION golf_safe_private.gross_agree(plan jsonb, pid text, day_no integer, hole integer, a text, b text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
 if plan->'courseLayouts'->('day'||day_no) is not null then card=golf_safe_private.layout_card(card,plan->'courseLayouts'->('day'||day_no),category||':'||tee);end if;
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
$function$
;
CREATE OR REPLACE FUNCTION golf_safe_private.validate_score(data jsonb, plan jsonb, pid text, day_no integer, organiser boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare h text;rec jsonb;section jsonb;group_ids jsonb;ids text[];pos integer;target text;fourball boolean;v text;method text=coalesce(plan->'scoringMethods'->>('day'||day_no),'holeByHole');total jsonb;
begin
 if plan->'courseLayouts'->('day'||day_no) is not null and data->'_meta'->>'layoutRevision' is distinct from plan->'courseLayouts'->('day'||day_no)->>'revision' then raise exception 'COURSE_LAYOUT_CHANGED: Refresh and acknowledge the revised layout before submitting scores' using errcode='40001';end if;
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
$function$
;

create or replace function golf_safe_private.protect_layout() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb; p jsonb; d int; l jsonb;old_l jsonb;before_plan jsonb;key text;
begin
 p=new.event_data->'event';
 if tg_op='UPDATE' then before_plan=old.event_data->'event';end if;
 for d in 1..greatest(coalesce((p->>'days')::int,1),coalesce((before_plan->>'days')::int,1)) loop
  key='day'||d;l=p->'courseLayouts'->key;old_l=before_plan->'courseLayouts'->key;
  if tg_op='UPDATE' and old_l is not null and (select value from jsonb_array_elements(old.event_data->'courses') where value->>'id'=old_l->>'courseId') is distinct from (select value from jsonb_array_elements(new.event_data->'courses') where value->>'id'=old_l->>'courseId') then raise exception 'Original card is frozen while an event layout adjustment is in use';end if;
  if l is distinct from old_l then
   if new.status in ('complete','completed','archived','cancelled') or p->>'locked' is distinct from 'true' then raise exception 'Course layout changes require a locked active event';end if;
   if tg_op='UPDATE' and golf_safe_private.layout_started(new.id,d) then raise exception 'Scoring has begun: this day course layout is locked' using errcode='42501';end if;
   if l is null or jsonb_array_length(l->'changes')<>coalesce(jsonb_array_length(old_l->'changes'),0)+1 or ((l->'changes')-(jsonb_array_length(l->'changes')-1)) is distinct from coalesce(old_l->'changes','[]') or l->>'revision' is not distinct from old_l->>'revision' then raise exception 'Append one course layout adjustment to the current published revision' using errcode='40001';end if;
  end if;
 end loop;
 if p ? 'courseLayouts' then perform golf_safe_private.layout_validate(p,new.event_data->'courses');end if;
 return new;
end;$$;
create trigger event_day_layout_guard before insert or update of event_data on public.away_events for each row execute function golf_safe_private.protect_layout();
create or replace function golf_safe_private.protect_layout_score() returns trigger language plpgsql security definer set search_path='' as $$
declare p jsonb;revision text;
begin
 select event_data->'event' into p from public.away_events where id=new.event_id for update;
 revision=p->'courseLayouts'->('day'||new.day)->>'revision';
 if revision is not null and new.score_data->'_meta'->>'layoutRevision' is distinct from revision then raise exception 'COURSE_LAYOUT_CHANGED: Refresh and acknowledge the revised layout before submitting scores' using errcode='40001';end if;
 return new;
end;$$;
create trigger event_day_layout_score_guard before insert or update of score_data on public.away_round_scores for each row execute function golf_safe_private.protect_layout_score();
revoke all on function golf_safe_private.layout_started(uuid,integer) from public,anon,authenticated;
revoke all on function golf_safe_private.layout_sequence(jsonb) from public,anon,authenticated;
revoke all on function golf_safe_private.layout_indexes(jsonb) from public,anon,authenticated;
revoke all on function golf_safe_private.layout_card(jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function golf_safe_private.layout_validate(jsonb,jsonb) from public,anon,authenticated;
revoke all on function golf_safe_private.protect_layout() from public,anon,authenticated;
revoke all on function golf_safe_private.protect_layout_score() from public,anon,authenticated;
