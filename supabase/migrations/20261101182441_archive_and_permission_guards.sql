-- Private writers trust only their internal/service callers.
revoke all on function away_course_private.write_master_course(text,jsonb,bigint,text,boolean,text) from public,anon,authenticated;
alter default privileges for role postgres in schema away_course_private revoke execute on functions from public;
alter default privileges for role postgres in schema golf_safe_private revoke execute on functions from public;

-- Browser roster changes go through the revision-checked event RPC.
revoke delete,truncate,references,trigger on public.away_event_players from authenticated;
revoke truncate,references,trigger on public.away_events,public.away_round_scores from authenticated;

create or replace function golf_safe_private.protect_scored_player()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.away_events where id=old.event_id)
 and exists(select 1 from public.away_round_scores where event_id=old.event_id and scorer_player_id=old.player_id) then
   raise exception 'Players with saved scores cannot be removed' using errcode='42501';
 end if;
 return old;
end;
$$;
revoke all on function golf_safe_private.protect_scored_player() from public,anon,authenticated,service_role;
drop trigger if exists protect_scored_player on public.away_event_players;
create trigger protect_scored_player before delete on public.away_event_players for each row execute function golf_safe_private.protect_scored_player();
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
  if p_status='archived' and e.status<>'archived' and exists(select 1 from golf_safe_private.conflicts where event_id=p_event_id and resolved_at is null) then raise exception 'Review saved copies before archiving this event' using errcode='42501';end if;
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
CREATE OR REPLACE FUNCTION public.away_master_gateway(p_action text, p_args jsonb, p_actor text, p_owner boolean, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cid text;
  result jsonb;
  p away_course_private.master_proposals;
begin
  if p_source not in ('away','ges') or btrim(coalesce(p_actor,''))='' then
    raise exception 'Verified source required' using errcode='42501';
  end if;
  cid=p_args->>'id';
  if p_action='load' then
    return jsonb_build_object(
      'courses',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'data',m.data,'revision',m.revision,'updated_at',m.updated_at) order by m.id),'[]') from public.away_master_courses m),
      'locations',(select coalesce(jsonb_agg(jsonb_build_object('country',r.country,'region',r.name) order by r.country,r.name),'[]') from public.away_master_course_regions r),
      'authority','away-master-v3-two-card-rotation',
      'proposalsAuthoritative',true,
      'proposals',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'course_id',q.course_id,'status',q.status)),'[]') from away_course_private.master_proposals q where q.actor=p_source||':'||p_actor)
    );
  elsif p_action='get' then
    select jsonb_build_object('id',m.id,'data',m.data,'revision',m.revision,'updated_at',m.updated_at)
      into result from public.away_master_courses m where m.id=cid;
    return result;
  elsif p_action='save' then
    return away_course_private.write_master_course(cid,p_args->'data',(p_args->>'revision')::bigint,p_source||':'||p_actor,p_owner,p_source);
  elsif p_action='history' then
    if not p_owner then raise exception 'Owner access required' using errcode='42501';end if;
    return coalesce((select jsonb_agg(jsonb_build_object('revision',h.revision,'data',h.data,'saved_at',h.saved_at))
      from public.away_master_course_history h where h.course_id=cid),'[]');
  elsif p_action='reviews' then
    if not p_owner then raise exception 'Owner access required' using errcode='42501';end if;
    return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'course_id',q.course_id,'name',coalesce(m.data->>'name',q.incoming->>'name'),'incoming',q.incoming,'current',m.data,'revision',m.revision,'base_revision',q.base_revision,'source',q.source,'created_at',q.created_at) order by q.created_at)
      from away_course_private.master_proposals q left join public.away_master_courses m on m.id=q.course_id where q.status='pending'),'[]');
  elsif p_action='resolve' then
    if not p_owner then raise exception 'Owner access required' using errcode='42501';end if;
    select * into p from away_course_private.master_proposals
      where id=(p_args->>'proposal_id')::uuid and status='pending' for update;
    if p.id is null then raise exception 'Course proposal is no longer pending';end if;
    if coalesce((p_args->>'accept')::boolean,false) then
      perform away_course_private.write_master_course(p.course_id,p.incoming,p.base_revision,p_source||':'||p_actor,true,p_source);
    end if;
    update away_course_private.master_proposals set
      status=case when coalesce((p_args->>'accept')::boolean,false) then 'accepted' else 'kept' end,
      reviewed_at=clock_timestamp(),reviewed_by=p_source||':'||p_actor,
      incoming=jsonb_build_object('name',incoming->>'name','reviewed',true)
    where id=p.id;
    delete from away_course_private.master_proposals q where q.id in
      (select id from (select id,row_number() over(partition by actor order by reviewed_at desc,id) rn from away_course_private.master_proposals where status<>'pending') x where rn>500);
    return jsonb_build_object('ok',true);
  elsif p_action='location' then
    if not p_owner then raise exception 'Owner access required' using errcode='42501';end if;
    insert into public.away_master_course_countries(name) values(btrim(p_args->>'country')) on conflict do nothing;
    if btrim(coalesce(p_args->>'region',''))<>'' then
      insert into public.away_master_course_regions(country,name) values(btrim(p_args->>'country'),btrim(p_args->>'region')) on conflict do nothing;
    end if;
    return jsonb_build_object('ok',true);
  else
    raise exception 'Unknown course action';
  end if;
end;
$function$
;

-- Inactive catalogue history is retained privately; only owner/internal functions access it.
revoke all on schema golf_catalogue_private from anon,authenticated;
revoke all on all functions in schema golf_catalogue_private from anon,authenticated;
alter table away_course_private.administrators enable row level security;
alter table away_course_private.master_proposals enable row level security;
alter table golf_catalogue_private.settings enable row level security;
alter table golf_catalogue_private.outbox enable row level security;
alter table golf_catalogue_private.inbox enable row level security;
alter table golf_catalogue_private.conflicts enable row level security;
alter table golf_catalogue_private.history enable row level security;
-- Recovery rows follow their event if an explicitly authorised physical delete
-- is ever performed. Normal archive never removes the event or final results.
alter table golf_safe_private.conflicts add constraint golf_conflicts_event_fk foreign key(event_id) references public.away_events(id) on delete cascade not valid;
alter table golf_safe_private.conflicts validate constraint golf_conflicts_event_fk;
alter table golf_safe_private.corrections add constraint golf_corrections_event_fk foreign key(event_id) references public.away_events(id) on delete cascade not valid;
alter table golf_safe_private.corrections validate constraint golf_corrections_event_fk;

create or replace function public.away_retention_cleanup(p_execute boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare reviews bigint;deliveries bigint;history bigint;protected_reviews bigint;
begin
 if auth.uid() is null or not exists(select 1 from away_course_private.administrators where user_id=auth.uid()) then
   raise exception 'Owner sign-in is required for recovery cleanup' using errcode='42501';
 end if;
 select count(*) into reviews from golf_safe_private.conflicts c join public.away_events e on e.id=c.event_id
 where e.status='archived' and c.resolved_at is not null and c.resolved_at<now()-interval '90 days';
 select count(*) into deliveries from golf_catalogue_private.outbox where delivered_at is not null and delivered_at<now()-interval '90 days';
 select count(*) into history from golf_catalogue_private.history h where h.saved_at<now()-interval '90 days'
 and not exists(select 1 from golf_catalogue_private.conflicts c where c.course_id=h.course_id and c.status not in ('accepted','kept','resolved'));
 select (select count(*) from golf_safe_private.conflicts where resolved_at is null)+(select count(*) from golf_catalogue_private.conflicts where status not in ('accepted','kept','resolved')) into protected_reviews;
 if p_execute then
   delete from golf_safe_private.conflicts c using public.away_events e where e.id=c.event_id and e.status='archived' and c.resolved_at is not null and c.resolved_at<now()-interval '90 days';get diagnostics reviews=row_count;
   delete from golf_catalogue_private.outbox where delivered_at is not null and delivered_at<now()-interval '90 days';get diagnostics deliveries=row_count;
   delete from golf_catalogue_private.history h where h.saved_at<now()-interval '90 days'
     and not exists(select 1 from golf_catalogue_private.conflicts c where c.course_id=h.course_id and c.status not in ('accepted','kept','resolved'));get diagnostics history=row_count;
 end if;
 return jsonb_build_object('executed',p_execute,'eligible',jsonb_build_object('resolvedReviews',reviews,'retiredDeliveries',deliveries,'retiredCourseBackups',history),'protectedReviews',protected_reviews);
end;
$$;
revoke all on function public.away_retention_cleanup(boolean) from public,anon;
grant execute on function public.away_retention_cleanup(boolean) to authenticated;
