-- Shared 1–7 day model, preserving group access and approved course enforcement.
create or replace function public.ges_plan_courses_allowed(plan jsonb,allowed text[]) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare n integer; day integer;
begin
 if coalesce(plan->>'days','') !~ '^[1-7]$' or allowed is null then return false;end if;
 n=(plan->>'days')::integer;
 for day in 1..n loop if not coalesce((plan->>('course'||day))=any(allowed),false) then return false;end if;end loop;
 return true;
end $$;
revoke all on function public.ges_plan_courses_allowed(jsonb,text[]) from public,anon;
grant execute on function public.ges_plan_courses_allowed(jsonb,text[]) to authenticated;
create table ges_private.live_trip_scores(event_id uuid not null references ges_private.live_events(id) on delete cascade,day integer not null check(day between 3 and 7),scorer_player_id text not null,score_data jsonb not null,revision bigint not null default 1,updated_at timestamptz not null default now(),primary key(event_id,day,scorer_player_id),foreign key(event_id,scorer_player_id) references ges_private.live_players(event_id,player_id));
revoke all on ges_private.live_trip_scores from public,anon,authenticated;
CREATE OR REPLACE FUNCTION ges_private.event_allowance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare allowance integer;approved text[];plan jsonb;pid text;
begin
 select golfer_count,requested_course_ids into allowance,approved from public.ges_groups where id=new.group_id for share;
 if new.field_size>coalesce(allowance,0) then raise exception 'Event field exceeds your approved player allowance (%)',allowance; end if;
 plan=new.planning_data->'event';
 if plan is not null then
  if (plan->>'fieldSize')::integer<>new.field_size then raise exception 'Event field size does not match the plan'; end if;
  if not public.ges_plan_courses_allowed(plan,approved) then raise exception 'Choose approved courses'; end if;
  if jsonb_array_length(coalesce(plan->'confirmed','[]'))>allowance then raise exception 'Too many players in the event'; end if;
  for pid in select jsonb_array_elements_text(coalesce(plan->'confirmed','[]')) loop
   if pid<>'system-no-partner' and not exists(select 1 from public.ges_players where id::text=pid and group_id=new.group_id and active) then raise exception 'Select active players from this group'; end if;
  end loop;
 end if;
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.ges_save_event(p_event_id uuid, p_expected_revision bigint, p_name text, p_date date, p_field_size integer, p_planning_data jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.ges_events; result bigint; allowed text[]; plan jsonb; payload jsonb;
begin
 select * into target from public.ges_events where id=p_event_id for update;
 if not found or not public.ges_can_access(target.group_id) then raise exception 'Group access denied' using errcode='42501'; end if;
 if target.status<>'draft' then raise exception 'Completed event planning is read-only'; end if;
 if target.revision is distinct from p_expected_revision then raise exception 'Event changed on another device. Refresh before saving.' using errcode='40001'; end if;
 payload=p_planning_data;plan=payload->'event';
 if plan is not null then
  if jsonb_typeof(plan)<>'object' then raise exception 'Invalid event plan'; end if;
  select requested_course_ids into allowed from public.ges_groups where id=target.group_id and enabled and setup_status='active';
  if not public.ges_plan_courses_allowed(plan,allowed) then raise exception 'Choose owner-approved courses before saving'; end if;
  payload=jsonb_set(payload,'{courseSnapshots}',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'details',c.details,'updated_at',c.updated_at) order by c.id) from public.ges_courses c where c.id in (select plan->>('course'||day) from generate_series(1,(plan->>'days')::integer) day)),'[]'));
 end if;
 update public.ges_events set name=trim(p_name),event_date=p_date,field_size=p_field_size,planning_data=payload,revision=revision+1,updated_at=now() where id=p_event_id returning revision into result;
 return result;
end; $function$;

CREATE OR REPLACE FUNCTION ges_private.live_call(p_action text, p_args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare eid uuid; e ges_private.live_events; d public.ges_events;g public.ges_groups;pid text; tok uuid;is_owner boolean;is_member boolean;is_spectator boolean;payload jsonb;plan jsonb;players jsonb;row jsonb;courses jsonb;result jsonb;expected bigint;day_no integer;
begin
 if p_action in ('create','update','sync_players','archive','release','save_score','load') then eid=(p_args->>'event_id')::uuid; end if;
 if p_action in ('invitation','join','spectate') then select id into eid from ges_private.live_events where join_code=upper(trim(p_args->>'code')) and status<>'archived'; end if;
 if p_action='create' then
  select * into d from public.ges_events where id=(p_args->>'draft_id')::uuid for update;
  if not found or auth.uid() is null or not public.ges_can_access(d.group_id) then raise exception 'Approved organiser access required' using errcode='42501'; end if;
  select * into g from public.ges_groups where id=d.group_id;
  if not g.enabled or g.setup_status<>'active' then raise exception 'Group activation required' using errcode='42501'; end if;
  select id into eid from ges_private.live_events where draft_id=d.id;
 end if;
 if eid is not null then select * into e from ges_private.live_events where id=eid for update; end if;
 if eid is not null then
  is_owner=ges_private.live_owner(eid);
  tok=nullif(p_args->>'token','')::uuid;
  is_member=tok is not null and exists(select 1 from ges_private.live_players where event_id=eid and token=tok);
  is_spectator=tok is not null and exists(select 1 from ges_private.live_spectators where event_id=eid and token=tok);
  if not exists(select 1 from public.ges_groups where id=e.group_id and enabled and setup_status='active') then raise exception 'Group access suspended' using errcode='42501'; end if;
 end if;
 if p_action in ('create','update') then
  if p_action='update' and not coalesce(is_owner,false) then raise exception 'Organiser access required' using errcode='42501'; end if;
  if p_action='update' then select * into d from public.ges_events where id=e.draft_id for update;select * into g from public.ges_groups where id=d.group_id; end if;
  payload=p_args->'payload';plan=payload->'event';players=payload->'players';
  if jsonb_typeof(plan) is distinct from 'object' or jsonb_typeof(players) is distinct from 'array' or pg_column_size(payload)>1500000 then raise exception 'Invalid event publication'; end if;
  if not public.ges_plan_courses_allowed(plan,g.requested_course_ids) then raise exception 'Only approved courses may be published'; end if;
  if coalesce((plan->>'fieldSize')::integer,0) not between 1 and least(60,g.golfer_count) or jsonb_array_length(players)=0 or jsonb_array_length(players)>g.golfer_count then raise exception 'Publish between 1 and % approved active golfers',least(60,g.golfer_count); end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(players))<>jsonb_array_length(players) then raise exception 'Duplicate players in publication'; end if;
  for row in select value from jsonb_array_elements(players) loop
   if not exists(select 1 from public.ges_players where id::text=row->>'id' and group_id=g.id and active) then raise exception 'Publication includes a player outside the active group'; end if;
  end loop;
  -- Rebuild public-facing player and course records from trusted records. Contacts stay private.
  select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'ga',plan->'gaHandicaps'->(p.id::text),'rosterActive',true,'golfLink','','homeClub','','notes','')) into players from public.ges_players p where p.group_id=g.id and p.id::text in (select value->>'id' from jsonb_array_elements(payload->'players'));
  select jsonb_agg(c.details||jsonb_build_object('id',c.id,'name',c.name,'available',true)) into courses from public.ges_courses c where c.id in (select plan->>('course'||day) from generate_series(1,(plan->>'days')::integer) day);
  if eid is not null and (e.event_data->'event'->>'days') is not distinct from (plan->>'days') and not exists(select 1 from generate_series(1,(plan->>'days')::integer) day where (e.event_data->'event'->>('course'||day)) is distinct from (plan->>('course'||day))) then courses=e.event_data->'courses'; end if;
  payload=jsonb_build_object('event',plan,'players',players,'courses',courses);
  if eid is null then
   insert into ges_private.live_events(draft_id,group_id,name,event_data,status) values(d.id,g.id,plan->>'name',payload,case when coalesce((plan->>'locked')::boolean,false) then 'locked' else 'setup' end) returning * into e;eid=e.id;
  else
   if p_action='update' and e.revision is distinct from (p_args->>'expected_revision')::bigint then raise exception 'Published event changed. Refresh before updating.' using errcode='40001'; end if;
   update ges_private.live_events set event_data=payload,name=plan->>'name',status=case when coalesce((plan->>'locked')::boolean,false) then 'locked' else 'setup' end,revision=revision+1,updated_at=now() where id=eid returning * into e;
  end if;
  insert into ges_private.live_players(event_id,player_id,display_name,player_data) select eid,value->>'id',value->>'name',jsonb_build_object('dailyHandicaps',p_args->'player_rows') from jsonb_array_elements(players) on conflict(event_id,player_id) do update set display_name=excluded.display_name;
  -- Retain connected historical rows once scoring exists; never silently delete scores.
  if exists(select 1 from (select * from ges_private.live_scores union all select * from ges_private.live_trip_scores) s where s.event_id=eid and s.scorer_player_id not in(select value->>'id' from jsonb_array_elements(players))) then raise exception 'Players with saved scores cannot be removed from a published event'; end if;
  delete from ges_private.live_players where event_id=eid and player_id not in(select value->>'id' from jsonb_array_elements(players));
  update public.ges_events set name=plan->>'name',event_date=(plan->>'date')::date,field_size=(plan->>'fieldSize')::integer,planning_data=jsonb_set(planning_data,'{event}',plan),revision=revision+1,updated_at=now() where id=d.id;
  return jsonb_build_object('event_id',eid,'id',eid,'join_code',e.join_code,'revision',e.revision,'updated_at',e.updated_at,'draft_revision',(select revision from public.ges_events where id=d.id));
 elsif p_action='invitation' then
  if eid is null then return '[]'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('event_name',e.name,'event_id',eid,'player_id',p.player_id,'display_name',p.display_name,'already_joined',p.token is not null) order by p.display_name) from ges_private.live_players p where p.event_id=eid),'[]');
 elsif p_action='join' then
  if eid is null then raise exception 'Event code not found'; end if;pid=p_args->>'player_id';
  select token into tok from ges_private.live_players where event_id=eid and player_id=pid;
  if not found then raise exception 'Choose a player in this event'; end if;
  if tok is not null and tok::text is distinct from p_args->>'token' then raise exception 'Player already joined. Ask the organiser to release the phone.'; end if;
  tok=coalesce(tok,gen_random_uuid());update ges_private.live_players set token=tok,joined_at=now() where event_id=eid and player_id=pid;
  return jsonb_build_object('event_id',eid,'token',tok);
 elsif p_action='spectate' then
  if eid is null then raise exception 'Event code not found'; end if;
  tok=gen_random_uuid();insert into ges_private.live_spectators values(eid,tok);return jsonb_build_object('event_id',eid,'token',tok);
 elsif p_action='load' then
  if eid is null or not (coalesce(is_owner,false) or coalesce(is_member,false) or coalesce(is_spectator,false)) then raise exception 'Event connection required' using errcode='42501'; end if;
  return ges_private.live_bundle(eid);
 elsif p_action='save_score' then
  pid=p_args->>'player_id';day_no=(p_args->>'day')::integer;
  if not coalesce(is_owner,false) and not exists(select 1 from ges_private.live_players where event_id=eid and player_id=pid and token=tok) then raise exception 'Cannot save another player''s scoring record' using errcode='42501'; end if;
  if e.status<>'locked' then raise exception 'The organiser must publish the final update before scoring'; end if;
  if day_no not between 1 and coalesce((e.event_data->'event'->>'days')::integer,1) or jsonb_typeof(p_args->'score_data') is distinct from 'object' or pg_column_size(p_args->'score_data')>120000 then raise exception 'Invalid score record'; end if;
  select revision into expected from (select * from ges_private.live_scores union all select * from ges_private.live_trip_scores) all_scores where event_id=eid and day=day_no and scorer_player_id=pid;
  if expected is not null and expected is distinct from (p_args->>'expected_revision')::bigint then raise exception 'Scores changed on another device. Refresh before saving.' using errcode='40001'; end if;
  if day_no>2 then insert into ges_private.live_trip_scores(event_id,day,scorer_player_id,score_data) values(eid,day_no,pid,p_args->'score_data') on conflict(event_id,day,scorer_player_id) do update set score_data=excluded.score_data,revision=live_trip_scores.revision+1,updated_at=now() returning jsonb_build_object('revision',revision,'updated_at',updated_at) into result; else insert into ges_private.live_scores(event_id,day,scorer_player_id,score_data) values(eid,day_no,pid,p_args->'score_data') on conflict(event_id,day,scorer_player_id) do update set score_data=excluded.score_data,revision=live_scores.revision+1,updated_at=now() returning jsonb_build_object('revision',revision,'updated_at',updated_at) into result;end if;return result;
 elsif p_action in ('release','archive','sync_players') then
  if not coalesce(is_owner,false) then raise exception 'Organiser access required' using errcode='42501'; end if;
  if p_action='release' then update ges_private.live_players set token=null,joined_at=null where event_id=eid and player_id=p_args->>'player_id';return '{}';
  elsif p_action='archive' then update ges_private.live_events set status='archived',revision=revision+1,updated_at=now() where id=eid;return jsonb_build_object('id',eid,'name',e.name,'join_code',e.join_code);
  else return '{}';end if;
 elsif p_action='list' then
  if auth.uid() is null then return '[]'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'join_code',x.join_code,'status',x.status,'updated_at',x.updated_at,'draft_id',x.draft_id) order by x.updated_at desc) from (select * from ges_private.live_events v where ges_private.live_owner(v.id) and (p_args->>'group_id' is null or v.group_id=(p_args->>'group_id')::uuid) and (case when coalesce((p_args->>'archived')::boolean,false) then v.status='archived' else v.status<>'archived' end) order by updated_at desc limit 100) x),'[]');
 end if;
 raise exception 'Unknown live event action';
end; $function$;


CREATE OR REPLACE FUNCTION ges_private.live_bundle(eid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('event',jsonb_build_object('id',e.id,'join_code',e.join_code,'name',e.name,'status',e.status,'event_data',e.event_data,'revision',e.revision,'updated_at',e.updated_at),'players',coalesce((select jsonb_agg(jsonb_build_object('player_id',p.player_id,'display_name',p.display_name,'player_data',p.player_data,'joined_at',p.joined_at,'member_user_id',case when p.token is null then null else 'connected' end)) from ges_private.live_players p where p.event_id=e.id),'[]'),'scores',coalesce((select jsonb_agg(jsonb_build_object('day',s.day,'scorer_player_id',s.scorer_player_id,'score_data',s.score_data,'revision',s.revision,'updated_at',s.updated_at)) from (select * from ges_private.live_scores union all select * from ges_private.live_trip_scores) s where s.event_id=e.id),'[]'),'spectatorCount',(select count(*) from ges_private.live_spectators where event_id=e.id)) from ges_private.live_events e where e.id=eid;
$function$
;

