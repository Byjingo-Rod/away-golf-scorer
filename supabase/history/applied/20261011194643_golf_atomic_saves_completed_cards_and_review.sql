create schema if not exists golf_safe_private;
revoke all on schema golf_safe_private from public,anon,authenticated;
create table if not exists golf_safe_private.conflicts(
 id uuid primary key default gen_random_uuid(),event_id uuid not null,kind text not null check(kind in ('event','score','draft')),
 day integer,player_id text,base_data jsonb,local_data jsonb not null,remote_data jsonb not null,
 original_remote jsonb,remote_revision bigint,actor uuid,created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid,resolution jsonb
);
create index if not exists golf_conflicts_event_open on golf_safe_private.conflicts(event_id,created_at) where resolved_at is null;
alter table golf_safe_private.conflicts enable row level security;
create table if not exists golf_safe_private.corrections(
 id uuid primary key default gen_random_uuid(),event_id uuid not null,day integer,player_id text,actor uuid,
 reason text not null,before_data jsonb,after_data jsonb,created_at timestamptz not null default now()
);
alter table golf_safe_private.corrections enable row level security;
create or replace function golf_safe_private.merge_value(b jsonb,l jsonb,r jsonb,choices jsonb default '[]',path text[] default '{}') returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; out_data jsonb='{}'; conflicts jsonb='[]'; choice text;i integer;lm jsonb;rm jsonb;bm jsonb;
begin
 if l is not distinct from r then return jsonb_build_object('data',l,'missing',l is null); end if;
 if l is not distinct from b then return jsonb_build_object('data',r,'missing',r is null); end if;
 if r is not distinct from b then return jsonb_build_object('data',l,'missing',l is null); end if;
 if path[array_length(path,1)]='furthestPos' and jsonb_typeof(l)='number' and jsonb_typeof(r)='number' then return jsonb_build_object('data',greatest((l#>>'{}')::numeric,(r#>>'{}')::numeric));end if;
 if path[array_length(path,1)] in ('finalUpdateAt','finalUpdateCloudSentAt','finalisedAt') and jsonb_typeof(l)='string' and jsonb_typeof(r)='string' then return jsonb_build_object('data',greatest(l#>>'{}',r#>>'{}'));end if;
 if jsonb_typeof(l)='array' and jsonb_typeof(r)='array' and jsonb_typeof(b)='array' and path[array_length(path,1)]='emergencyRecoveryLog' then
  lm='[]';rm='[]';for i in 0..jsonb_array_length(b)-1 loop lm=lm||jsonb_build_array(l->i);rm=rm||jsonb_build_array(r->i);end loop;
  if lm=b and rm=b then out_data=r;for i in jsonb_array_length(b)..jsonb_array_length(l)-1 loop if not r @> jsonb_build_array(l->i) then out_data=out_data||jsonb_build_array(l->i);end if;end loop;return jsonb_build_object('data',out_data,'conflicts','[]'::jsonb);end if;
 end if;
 if jsonb_typeof(l)='array' and jsonb_typeof(r)='array' and jsonb_typeof(b)='array' and path[array_length(path,1)] in ('players','courses') then
  select jsonb_object_agg(value->>'id',value) into lm from jsonb_array_elements(l);select jsonb_object_agg(value->>'id',value) into rm from jsonb_array_elements(r);select jsonb_object_agg(value->>'id',value) into bm from jsonb_array_elements(b);
  v=golf_safe_private.merge_value(coalesce(bm,'{}'),coalesce(lm,'{}'),coalesce(rm,'{}'),choices,path);
  select coalesce(jsonb_agg(value order by key),'[]') into out_data from jsonb_each(v->'data');return jsonb_build_object('data',out_data,'conflicts',coalesce(v->'conflicts','[]'));
 end if;
 if jsonb_typeof(l)='array' and jsonb_typeof(r)='array' and jsonb_typeof(b)='array' and path[array_length(path,1)]='groups' and jsonb_array_length(l)=jsonb_array_length(b) and jsonb_array_length(r)=jsonb_array_length(b) then
  out_data='[]';for i in 0..jsonb_array_length(b)-1 loop v=golf_safe_private.merge_value(b->i,l->i,r->i,choices,path||i::text);out_data=out_data||jsonb_build_array(v->'data');conflicts=conflicts||coalesce(v->'conflicts','[]');end loop;return jsonb_build_object('data',out_data,'conflicts',conflicts);
 end if;
 if jsonb_typeof(l)='object' and jsonb_typeof(r)='object' and (b is null or b='null'::jsonb or jsonb_typeof(b)='object') then
  for k in select key from jsonb_object_keys(case when jsonb_typeof(b)='object' then b else '{}'::jsonb end) key union select key from jsonb_object_keys(l) key union select key from jsonb_object_keys(r) key loop
   v=golf_safe_private.merge_value(b->k,l->k,r->k,choices,path||k);
   if not coalesce((v->>'missing')::boolean,false) then out_data=out_data||jsonb_build_object(k,v->'data');end if;
   conflicts=conflicts||coalesce(v->'conflicts','[]');
  end loop;
  return jsonb_build_object('data',out_data,'conflicts',conflicts);
 end if;
 select value->>'choice' into choice from jsonb_array_elements(coalesce(choices,'[]')) where value->'path'=to_jsonb(path) limit 1;
 if choice='local' then return jsonb_build_object('data',l,'missing',l is null);elsif choice='remote' then return jsonb_build_object('data',r,'missing',r is null);end if;
 return jsonb_build_object('data',l,'conflicts',jsonb_build_array(jsonb_build_object('path',path,'base',b,'local',l,'remote',r)));
end;$$;
create or replace function golf_safe_private.validate_score(data jsonb,plan jsonb,pid text,day_no integer,organiser boolean) returns void
language plpgsql set search_path='' as $$
declare h text;rec jsonb;section jsonb;group_ids jsonb;ids text[];pos integer;target text;fourball boolean;v text;
begin
 if day_no not between 1 and coalesce((plan->>'days')::integer,1) or jsonb_typeof(data) is distinct from 'object' or pg_column_size(data)>120000 then raise exception 'Invalid score record' using errcode='22023';end if;
 for group_ids in select value from jsonb_array_elements(coalesce(plan->'groupSetup'->('day'||day_no)->'groups','[]')) loop
  select array_agg(value order by ordinality) into ids from jsonb_array_elements_text(group_ids) with ordinality where value<>'system-no-partner';
  pos=array_position(ids,pid);exit when pos is not null;
 end loop;
 if not organiser and pos is null then raise exception 'Player is not assigned to this day' using errcode='42501';end if;
 if pos is not null then
  fourball=coalesce(plan->'competitions' ? 'fourball',false) and (plan->'competitionDays'->'fourball' is null or plan->'competitionDays'->'fourball' @> to_jsonb(array[day_no]));
  if cardinality(ids)=3 or not fourball then target=ids[(pos%cardinality(ids))+1];
  else target=ids[case when pos%2=1 then pos+1 else pos-1 end];end if;
 end if;
 for h,rec in select * from jsonb_each(data) loop
  if h='_meta' then if jsonb_typeof(rec)<>'object' then raise exception 'Invalid card metadata';end if;continue;end if;
  if h !~ '^([1-9]|1[0-8])$' or jsonb_typeof(rec)<>'object' then raise exception 'Invalid hole key';end if;
  for section in select value from jsonb_each(rec) where key in ('official','self') loop
   if jsonb_typeof(section)<>'object' then raise exception 'Invalid score entry';end if;
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
end;$$;
create or replace function golf_safe_private.closed(plan jsonb,day_no integer,pid text,old_data jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(plan->>'status' in ('complete','completed','cancelled','archived'),false)
 or nullif(plan->'roundFinalised'->('day'||day_no)->>pid,'') is not null
 or nullif(old_data->'_meta'->>'finalisedAt','') is not null
 or coalesce(plan->'manualScorecards'->('day'||day_no)->>'status'='submitted',false);
$$;
revoke all on all functions in schema golf_safe_private from public,anon,authenticated;

create or replace function golf_safe_private.guard_player(data jsonb,old_data jsonb,plan jsonb,pid text,day_no integer,cards jsonb) returns void
language plpgsql set search_path='' as $$
declare h text;rec jsonb;target text;marker jsonb;putting boolean;ambrose boolean;
begin
 putting=coalesce(plan->'competitions' ? 'teamPutts',false) and (plan->'competitionDays'->'teamPutts' is null or plan->'competitionDays'->'teamPutts' @> to_jsonb(array[day_no]));
 ambrose=coalesce(plan->'competitions' ? 'ambrose',false);
 if coalesce((data->'_meta'->>'emergencyFinalised')::boolean,false) and data->'_meta'->'emergencyFinalised' is distinct from old_data->'_meta'->'emergencyFinalised' then raise exception 'Organiser acceptance required' using errcode='42501';end if;
 for h,rec in select * from jsonb_each(data) where key<>'_meta' loop
  target=rec->'official'->>'playerId';
  if target is not null and rec->'official' is distinct from old_data->h->'official' and golf_safe_private.closed(plan,day_no,target,cards->target) then raise exception 'GOLF_CLOSED: Marked card accepted. Use organiser correction.' using errcode='42501';end if;
 end loop;
 if nullif(data->'_meta'->>'finalisedAt','') is not null then
  for h in select generate_series(1,18)::text loop
   rec=data->h;
   if nullif(rec->'self'->>'gross','') is null then raise exception 'All 18 self scores are required for acceptance';end if;
   if ambrose then
    if nullif(rec->'ambrose'->>'drivePlayerId','') is null then raise exception 'Every Ambrose hole requires a selected drive';end if;
   else
    target=rec->'official'->>'playerId';
    if nullif(rec->'official'->>'gross','') is null or target is null or upper(rec->'official'->>'gross') is distinct from upper(cards->target->h->'self'->>'gross') then raise exception 'Marked card does not agree online yet';end if;
    select value->h->'official' into marker from jsonb_each(cards) where value->h->'official'->>'playerId'=pid limit 1;
    if upper(rec->'self'->>'gross') is distinct from upper(marker->>'gross') then raise exception 'Own card does not agree online yet';end if;
    if putting and (nullif(rec->'self'->>'putts','') is null or nullif(rec->'official'->>'putts','') is null or (rec->'self'->>'putts')::integer is distinct from (marker->>'putts')::integer or (rec->'official'->>'putts')::integer is distinct from (cards->target->h->'self'->>'putts')::integer) then raise exception 'Putts do not agree online yet';end if;
   end if;
  end loop;
 end if;
end;$$;
revoke all on function golf_safe_private.guard_player(jsonb,jsonb,jsonb,text,integer,jsonb) from public,anon,authenticated;
create or replace function public.golf_safe_away_save(p_kind text,p_event_id uuid,p_day integer,p_player_id text,p_data jsonb,p_expected_revision bigint,p_correction boolean default false,p_reason text default null,p_status text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
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
  insert into public.away_event_players(event_id,player_id,display_name,player_data) select p_event_id,value->>'id',coalesce(value->>'name','Player'),value-'id'-'name' from jsonb_array_elements(p_data->'players') on conflict(event_id,player_id) do update set display_name=excluded.display_name,player_data=excluded.player_data;
  delete from public.away_event_players where event_id=p_event_id and player_id not in(select value->>'id' from jsonb_array_elements(p_data->'players'));
  insert into golf_safe_private.corrections(event_id,actor,reason,before_data,after_data) values(p_event_id,auth.uid(),'Organiser event plan update',e.event_data,p_data);
  update public.away_events set event_data=p_data,name=coalesce(p_data->'event'->>'name',name),status=coalesce(p_status,status) where id=p_event_id returning jsonb_build_object('id',id,'join_code',join_code,'revision',revision,'updated_at',updated_at) into result;return result;
 end if;
 if p_kind<>'score' then raise exception 'Unknown save kind';end if;
 if not coalesce(organiser,false) and not exists(select 1 from public.away_event_players where event_id=p_event_id and player_id=p_player_id and member_user_id=auth.uid()) then raise exception 'Player connection required' using errcode='42501';end if;
 if not exists(select 1 from public.away_event_players where event_id=p_event_id and player_id=p_player_id) then raise exception 'Player is outside event';end if;
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
  perform golf_safe_private.guard_player(p_data,old_row.score_data,e.event_data->'event',p_player_id,p_day,coalesce(cards,'{}'));
 end if;

 insert into public.away_round_scores(event_id,day,scorer_player_id,score_data) values(p_event_id,p_day,p_player_id,p_data) on conflict(event_id,day,scorer_player_id) do update set score_data=excluded.score_data returning jsonb_build_object('revision',revision,'updated_at',updated_at) into result;return result;
end;$$;
revoke all on function public.golf_safe_away_save(text,uuid,integer,text,jsonb,bigint,boolean,text,text) from public,anon;
grant execute on function public.golf_safe_away_save(text,uuid,integer,text,jsonb,bigint,boolean,text,text) to authenticated;
-- All browser writes must use the atomic save path. Older clients retain local cards and need to update.
revoke insert,update on public.away_round_scores from authenticated;
revoke update on public.away_events from authenticated;

create index if not exists golf_away_score_player on public.away_round_scores(event_id,scorer_player_id);
create or replace function golf_safe_private.control(action text,args jsonb,organiser boolean,member boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c golf_safe_private.conflicts;result jsonb;merged jsonb;current_data jsonb;current_revision bigint;eid uuid=(args->>'event_id')::uuid;
begin
 if action='retain' then
  if not organiser and not member then raise exception 'Event connection required' using errcode='42501';end if;
  if args->>'kind' not in ('event','score') or (args->>'kind'='event' and not organiser) or jsonb_typeof(args->'local') is distinct from 'object' or jsonb_typeof(args->'remote') is distinct from 'object' or pg_column_size(args)>4500000 then raise exception 'Invalid retained changes';end if;
  if not organiser and not exists(select 1 from public.away_event_players where event_id=eid and player_id=args->>'player_id' and member_user_id=auth.uid()) then raise exception 'Cannot retain another card' using errcode='42501';end if;
  select * into c from golf_safe_private.conflicts where event_id=eid and kind=args->>'kind' and day is not distinct from (args->>'day')::integer and player_id is not distinct from args->>'player_id' and local_data=args->'local' and remote_data=args->'remote' and resolved_at is null limit 1;
  if not found then insert into golf_safe_private.conflicts(event_id,kind,day,player_id,base_data,local_data,remote_data,original_remote,remote_revision,actor) values(eid,args->>'kind',(args->>'day')::integer,args->>'player_id',args->'base',args->'local',args->'remote',args->'remote',(args->>'revision')::bigint,auth.uid()) returning * into c;end if;
  return jsonb_build_object('id',c.id);
 elsif action='list' then
  if not organiser then raise exception 'Organiser review required' using errcode='42501';end if;
for c in select * from golf_safe_private.conflicts where event_id=eid and resolved_at is null loop
   if c.kind='event' then select event_data,revision into current_data,current_revision from public.away_events where id=eid;
   else select score_data,revision into current_data,current_revision from public.away_round_scores s where event_id=eid and day=c.day and scorer_player_id=c.player_id;current_data=coalesce(current_data,'{}');end if;
   update golf_safe_private.conflicts set remote_data=current_data,remote_revision=current_revision where id=c.id;
  end loop;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (select * from golf_safe_private.conflicts where event_id=eid and resolved_at is null order by created_at) x),'[]');
 elsif action='status' then
  select * into c from golf_safe_private.conflicts where id=(args->>'id')::uuid and event_id=eid;
  if not found then raise exception 'Review not available';end if;
  if not organiser and not exists(select 1 from public.away_event_players where event_id=eid and player_id=c.player_id and member_user_id=auth.uid()) then raise exception 'Player connection required' using errcode='42501';end if;
  if c.resolved_at is null then return jsonb_build_object('resolved',false);end if;
  if c.kind='event' then select event_data,revision into current_data,current_revision from public.away_events where id=eid;else select score_data,revision into current_data,current_revision from public.away_round_scores s where event_id=eid and day=c.day and scorer_player_id=c.player_id;end if;
  return jsonb_build_object('resolved',true,'data',current_data,'revision',current_revision);
 elsif action='resolve' then
  if not organiser then raise exception 'Organiser review required' using errcode='42501';end if;
  select * into c from golf_safe_private.conflicts where id=(args->>'id')::uuid for update;
  if not found or c.resolved_at is not null then raise exception 'Conflict already reviewed';end if;
  if c.kind='event' then select event_data,revision into current_data,current_revision from public.away_events where id=c.event_id for update;else select score_data,revision into current_data,current_revision from public.away_round_scores where event_id=c.event_id and day=c.day and scorer_player_id=c.player_id for update;current_data=coalesce(current_data,'{}');end if;
  if current_revision is distinct from c.remote_revision or current_data is distinct from c.remote_data then raise exception 'Saved card changed again. Refresh comparison before reviewing.' using errcode='40001';end if;
  merged=golf_safe_private.merge_value(c.base_data,c.local_data,c.remote_data,args->'choices');
  if jsonb_array_length(coalesce(merged->'conflicts','[]'))>0 then raise exception 'Choose a saved value for every conflicting field';end if;
  result=public.golf_safe_away_save(c.kind,c.event_id,c.day,c.player_id,merged->'data',current_revision,c.kind='score','Saved-copy conflict review',null);
  update golf_safe_private.conflicts set resolved_at=now(),resolved_by=auth.uid(),resolution=args->'choices' where id=c.id;
  return jsonb_build_object('event_id',c.event_id,'kind',c.kind,'day',c.day,'player_id',c.player_id,'data',merged->'data','revision',result->'revision');
 end if;
 raise exception 'Unknown review action';
end;$$;
revoke all on function golf_safe_private.control(text,jsonb,boolean,boolean) from public,anon,authenticated;
create or replace function public.golf_safe_control(p_action text,p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid=(p_args->>'event_id')::uuid;
begin
 if p_action='resolve' then select event_id into eid from golf_safe_private.conflicts where id=(p_args->>'id')::uuid;end if;
 return golf_safe_private.control(p_action,p_args,coalesce(public.is_away_event_organiser(eid),false),exists(select 1 from public.away_event_players where event_id=eid and member_user_id=auth.uid()));
end;$$;
revoke all on function public.golf_safe_control(text,jsonb) from public,anon;
grant execute on function public.golf_safe_control(text,jsonb) to authenticated;

