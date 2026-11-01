-- Narrow live action: retire obsolete course bridge objects only.
-- Fresh rebuilds opt in before applying this ordered history.
do $rebuild$
begin
 if current_setting('away.rebuild_mode',true)='fresh' then
   if exists(select 1 from public.away_events) or exists(select 1 from public.away_master_courses) then
     raise exception 'Fresh rebuild mode requires an empty event and course database';
   end if;
   execute $baseline$
-- Reconcile out-of-band production changes into the ordered restore source.
-- Definitions are from the verified production export, with this release's
-- score/archival/approval fixes. No event, course, identity or secret values.

CREATE OR REPLACE FUNCTION away_course_private.course_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  delete from public.away_master_course_history
  where course_id = new.id;

  if tg_op = 'UPDATE'
     and nullif(btrim(old.data ->> 'masterAcceptedAt'), '') is not null
  then
    insert into public.away_master_course_history
      (course_id, revision, data, saved_at, saved_by)
    values
      (old.id, old.revision, old.data, clock_timestamp(), new.updated_by);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION away_course_private.course_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if (tg_op='INSERT' and new.revision<>1) or (tg_op='UPDATE' and new.revision<>old.revision+1) then raise exception 'Invalid course revision'; end if;
 new.updated_at=now();
 new.updated_by=coalesce(auth.uid(),new.updated_by);
 if new.updated_by is null then raise exception 'Course editor identity is required' using errcode='42501';end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION away_course_private.editor_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and (
 exists(select 1 from away_course_private.administrators a where a.user_id=auth.uid())
 or exists(select 1 from public.away_event_organisers eo
 join public.away_events e on e.id=eo.event_id
 join away_course_private.administrators a on a.user_id=e.organiser_id
 where eo.user_id=auth.uid() and eo.access_type='tablet' and eo.revoked_at is null and e.status<>'archived'));
$function$
;

CREATE OR REPLACE FUNCTION away_course_private.write_master_course(cid text, doc jsonb, expected bigint, actor text, owner boolean, source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.away_master_courses; proposal uuid; system_owner uuid;
begin
 if cid is null or length(cid)>120 or jsonb_typeof(doc)<>'object' or btrim(coalesce(doc->>'name',''))='' then raise exception 'Valid course details are required';end if;
 select user_id into system_owner from away_course_private.administrators order by user_id limit 1;
 if system_owner is null then raise exception 'Away Golf owner is not configured' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('away-master:'||cid,0));
 select * into c from public.away_master_courses where id=cid for update;
 if c.id is null then
   if not owner then
     insert into away_course_private.master_proposals(course_id,base_revision,incoming,actor,source) values(cid,null,jsonb_set(doc,'{id}',to_jsonb(cid)),actor,source) returning id into proposal;
     return jsonb_build_object('id',cid,'data',jsonb_set(doc,'{id}',to_jsonb(cid)),'revision',null,'pending_approval',true,'proposal_id',proposal);
   end if;
   insert into public.away_master_courses(id,data,updated_by) values(cid,jsonb_set(doc||jsonb_build_object('masterAcceptedAt',clock_timestamp(),'masterAcceptedSource',source),'{id}',to_jsonb(cid)),system_owner) returning * into c;
 else
   if expected is distinct from c.revision then raise exception 'The master course changed. Refresh before saving.' using errcode='40001';end if;
   if not owner then
     select p.id into proposal from away_course_private.master_proposals p where p.course_id=cid and p.actor=write_master_course.actor and p.base_revision=expected and p.incoming=jsonb_set(doc,'{id}',to_jsonb(cid)) and p.status='pending' order by p.created_at limit 1;
     if proposal is null then insert into away_course_private.master_proposals(course_id,base_revision,incoming,actor,source) values(cid,expected,jsonb_set(doc,'{id}',to_jsonb(cid)),actor,source) returning id into proposal;end if;
     return jsonb_build_object('id',c.id,'data',c.data,'revision',c.revision,'updated_at',c.updated_at,'pending_approval',true,'proposal_id',proposal);
   end if;
   update public.away_master_courses set data=jsonb_set(doc||jsonb_build_object('masterAcceptedAt',clock_timestamp(),'masterAcceptedSource',source),'{id}',to_jsonb(cid)),revision=revision+1,updated_by=system_owner where id=cid returning * into c;
 end if;
 return jsonb_build_object('id',c.id,'data',c.data,'revision',c.revision,'updated_at',c.updated_at);
end $function$
;

CREATE OR REPLACE FUNCTION golf_catalogue_private.country_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin insert into public.golf_course_locations(country,region) values(new.name,'') on conflict do nothing;return new;end $function$
;

CREATE OR REPLACE FUNCTION golf_catalogue_private.course_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cid text=case when new.id like 'ges-%' then substr(new.id,5) else 'away-'||new.id end;
begin
 if tg_op='UPDATE' then insert into golf_catalogue_private.history(course_id,data) values(cid,old.data);end if;
 insert into public.golf_course_locations values(coalesce(nullif(new.data->>'country',''),'Australia'),coalesce(new.data->>'region','')) on conflict do nothing;
 perform golf_catalogue_private.enqueue(cid,new.data,case when tg_op='UPDATE' then old.data else null end);return new;
end $function$
;

CREATE OR REPLACE FUNCTION golf_catalogue_private.dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare row golf_catalogue_private.outbox;cfg golf_catalogue_private.settings;answer net._http_response;sig text;
begin
 select * into cfg from golf_catalogue_private.settings;if not found then return;end if;
 for row in select * from golf_catalogue_private.outbox where delivered_at is null and request_id is not null loop
  select * into answer from net._http_response where id=row.request_id;
  if found then
   if answer.status_code=200 and coalesce(answer.content,'') like '%"status"%' then
    update golf_catalogue_private.outbox set delivered_at=now(),response=answer.content::jsonb where id=row.id;
   else update golf_catalogue_private.outbox set request_id=null,response=jsonb_build_object('http_status',answer.status_code) where id=row.id;end if;
  elsif row.attempted_at<now()-interval '2 minutes' then update golf_catalogue_private.outbox set request_id=null where id=row.id;
  end if;
 end loop;
 for row in select o.* from golf_catalogue_private.outbox o where o.delivered_at is null and o.request_id is null and not exists(select 1 from golf_catalogue_private.outbox earlier where earlier.course_id=o.course_id and earlier.delivered_at is null and (earlier.created_at,earlier.id)<(o.created_at,o.id)) order by o.created_at limit 100 loop
  sig=encode(extensions.hmac(row.payload::text,cfg.secret,'sha256'),'hex');
  update golf_catalogue_private.outbox set request_id=net.http_post(url:=cfg.peer_url||'/rest/v1/rpc/golf_receive_course',headers:=jsonb_build_object('Content-Type','application/json','apikey',cfg.peer_key),body:=jsonb_build_object('p_message',row.payload,'p_signature',sig),timeout_milliseconds:=10000),attempted_at=now() where id=row.id;
 end loop;
end $function$
;

CREATE OR REPLACE FUNCTION golf_catalogue_private.enqueue(cid text, doc jsonb, previous jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare mid uuid=gen_random_uuid();
begin
 if coalesce(current_setting('golf.catalogue_receiving',true),'off')='on' then return;end if;
 insert into golf_catalogue_private.outbox(id,course_id,payload) values(mid,cid,jsonb_build_object('message_id',mid,'course_id',cid,'kind','course','data',doc,'base_hash',golf_catalogue_private.hash(previous)));
 perform golf_catalogue_private.dispatch();
end $function$
;

CREATE OR REPLACE FUNCTION golf_catalogue_private.get_doc(cid text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select data from public.away_master_courses where id=case when cid like 'away-%' then substr(cid,6) else 'ges-'||cid end;$function$
;

CREATE OR REPLACE FUNCTION golf_catalogue_private.hash(doc jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$select case when doc is null then null else encode(extensions.digest(golf_catalogue_private.normal(doc)::text,'sha256'),'hex') end;$function$
;

CREATE OR REPLACE FUNCTION golf_catalogue_private.location_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare mid uuid=gen_random_uuid();
begin
 if coalesce(current_setting('golf.catalogue_receiving',true),'off')<>'on' then
  insert into golf_catalogue_private.outbox(id,course_id,payload) values(mid,'location:'||new.country||':'||new.region,jsonb_build_object('message_id',mid,'course_id','location:'||new.country||':'||new.region,'kind','location','country',new.country,'region',new.region));perform golf_catalogue_private.dispatch();
 end if;return new;
end $function$
;

CREATE OR REPLACE FUNCTION golf_catalogue_private.normal(doc jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$select doc-'id'-'acceptedAt'-'acceptedBy'-'activeScorecardTee'-'activeVersionId'-'versions';$function$
;

CREATE OR REPLACE FUNCTION golf_catalogue_private.put_doc(cid text, doc jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare lid text=case when cid like 'away-%' then substr(cid,6) else 'ges-'||cid end;previous jsonb;
begin
 if auth.uid() is null then perform set_config('request.jwt.claim.sub',(select user_id::text from away_course_private.administrators order by user_id limit 1),true);end if;
 select data into previous from public.away_master_courses where id=lid;
 if previous is not null then insert into golf_catalogue_private.history(course_id,data) values(cid,previous);end if;
 insert into public.away_master_courses(id,data) values(lid,jsonb_set(doc,'{id}',to_jsonb(lid))) on conflict(id) do update set data=excluded.data,revision=away_master_courses.revision+1;
end $function$
;

CREATE OR REPLACE FUNCTION golf_catalogue_private.receive(p_message jsonb, p_signature text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cfg golf_catalogue_private.settings;mid uuid;cid text;doc jsonb;current_doc jsonb;status text;
begin
 select * into cfg from golf_catalogue_private.settings;
 if cfg.secret is null or length(p_signature)<>64 or p_signature is distinct from encode(extensions.hmac(p_message::text,cfg.secret,'sha256'),'hex') then raise exception 'Catalogue signature rejected' using errcode='42501';end if;
 if pg_column_size(p_message)>2000000 then raise exception 'Course message too large';end if;
 mid=(p_message->>'message_id')::uuid;cid=p_message->>'course_id';
 if length(cid) not between 1 and 120 then raise exception 'Invalid course identity';end if;
 perform pg_advisory_xact_lock(hashtextextended('golf-catalogue:'||cid,0));
 select i.status into status from golf_catalogue_private.inbox i where i.id=mid;if found then return jsonb_build_object('status',status);end if;
 if p_message->>'kind'='location' then
  perform set_config('golf.catalogue_receiving','on',true);
  insert into public.golf_course_locations(country,region) values(p_message->>'country',coalesce(p_message->>'region','')) on conflict do nothing;
  perform set_config('golf.catalogue_receiving','off',true);status='applied';
 else
  doc=p_message->'data';if jsonb_typeof(doc) is distinct from 'object' or length(coalesce(doc->>'name','')) not between 1 and 160 then raise exception 'Invalid course';end if;
  current_doc=golf_catalogue_private.get_doc(cid);
  if golf_catalogue_private.hash(current_doc)=golf_catalogue_private.hash(doc) then status='unchanged';
  elsif current_doc is null or golf_catalogue_private.hash(current_doc) is not distinct from (p_message->>'base_hash') then
   perform set_config('golf.catalogue_receiving','on',true);perform golf_catalogue_private.put_doc(cid,doc);perform set_config('golf.catalogue_receiving','off',true);status='applied';
  else
   insert into golf_catalogue_private.conflicts(id,course_id,local_hash,incoming) values(mid,cid,golf_catalogue_private.hash(current_doc),doc);status='review';
  end if;
 end if;
 insert into golf_catalogue_private.inbox(id,status) values(mid,status);
 return jsonb_build_object('status',status);
end $function$
;

CREATE OR REPLACE FUNCTION golf_safe_private.closed(plan jsonb, day_no integer, pid text, old_data jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select coalesce(plan->>'status' in ('complete','completed','cancelled','archived'),false)
 or nullif(plan->'roundFinalised'->('day'||day_no)->>pid,'') is not null
 or nullif(old_data->'_meta'->>'finalisedAt','') is not null
 or nullif(old_data->'_finalScore'->>'confirmedAt','') is not null
 or coalesce(plan->'manualScorecards'->('day'||day_no)->>'status'='submitted',false);
$function$
;

CREATE OR REPLACE FUNCTION golf_safe_private.competition_on(plan jsonb, cid text, day_no integer)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select coalesce(plan->'competitions' ? cid,false) and (
   (cid='capTeams') or
   (cid='scratch' and plan->>'scratchFormat' in ('aggregate','bestAggregate')) or
   (cid='par3' and coalesce(plan->>'par3Mode',case when plan->>'par3Format'='aggregate' then 'overallPairs' else 'dailyPairs' end) in ('overallPlayers','overallPairs')) or
   coalesce(plan->'competitionDays'->cid,case when cid='yellowBall' then plan->'yellowBallDays' end) is null or
   coalesce(plan->'competitionDays'->cid,case when cid='yellowBall' then plan->'yellowBallDays' end) @> to_jsonb(array[day_no])
 );
$function$
;

CREATE OR REPLACE FUNCTION golf_safe_private.control(action text, args jsonb, organiser boolean, member boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end;$function$
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

CREATE OR REPLACE FUNCTION golf_safe_private.merge_value(b jsonb, l jsonb, r jsonb, choices jsonb DEFAULT '[]'::jsonb, path text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
end;$function$
;

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

CREATE OR REPLACE FUNCTION golf_safe_private.shared_slot(plan jsonb, pid text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select coalesce((select key from jsonb_each(coalesce(plan->'sharedPositions','{}')) p where p.key=pid or exists(select 1 from jsonb_each_text(p.value) d where d.value=pid) limit 1),pid);
$function$
;

CREATE OR REPLACE FUNCTION golf_safe_private.validate_score(data jsonb, plan jsonb, pid text, day_no integer, organiser boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION golf_safe_private.validate_shared_positions(before_plan jsonb, plan jsonb, players jsonb, allowance integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare slot text; assignments jsonb; d integer; pid text; count_positions integer;
begin
 if coalesce((before_plan->>'locked')::boolean,false) and coalesce(before_plan->'sharedPositions','{}') is distinct from coalesce(plan->'sharedPositions','{}') then raise exception 'Shared positions are fixed after final publication';end if;
 if jsonb_typeof(coalesce(plan->'sharedPositions','{}')) is distinct from 'object' then raise exception 'Invalid shared positions';end if;
 if coalesce(plan->'sharedPositions','{}')='{}'::jsonb then return;end if;
 if jsonb_typeof(players) is distinct from 'array' then raise exception 'Invalid player roster';end if;
 select count(distinct golf_safe_private.shared_slot(plan,value->>'id')) into count_positions from jsonb_array_elements(players);
 if count_positions<1 or count_positions>allowance then raise exception 'Too many playing positions';end if;
 for slot,assignments in select key,value from jsonb_each(coalesce(plan->'sharedPositions','{}')) loop
  if jsonb_typeof(assignments) is distinct from 'object' or (select count(distinct value) from jsonb_each_text(assignments))<2 or not exists(select 1 from jsonb_each_text(assignments) where value=slot) then raise exception 'Assign both golfers to the shared position';end if;
  if not exists(select 1 from jsonb_array_elements_text(coalesce(plan->'confirmed','[]')) where value=slot) then raise exception 'Shared position must belong to the selected field';end if;
  for d in 1..(plan->>'days')::integer loop
   pid=assignments->>('day'||d);
   if pid is null or not exists(select 1 from jsonb_array_elements(players) where value->>'id'=pid) then raise exception 'Assign a registered event golfer to every shared day';end if;
   if pid<>slot and exists(select 1 from jsonb_array_elements_text(coalesce(plan->'confirmed','[]')) where value=pid) then raise exception 'Shared golfer already has another position';end if;
   if exists(select 1 from jsonb_each(coalesce(plan->'sharedPositions','{}')) p where p.key<>slot and (p.key=pid or exists(select 1 from jsonb_each_text(p.value) where value=pid))) then raise exception 'A golfer cannot share two positions';end if;
  end loop;
 end loop;
 for d in 1..(plan->>'days')::integer loop
  if jsonb_array_length(coalesce(plan->'dayFields'->('day'||d),plan->'confirmed','[]'))>allowance or (select count(distinct value) from jsonb_array_elements_text(coalesce(plan->'dayFields'->('day'||d),plan->'confirmed','[]')))<>jsonb_array_length(coalesce(plan->'dayFields'->('day'||d),plan->'confirmed','[]')) then raise exception 'Invalid daily player count';end if;
  for pid in select value from jsonb_array_elements_text(coalesce(plan->'dayFields'->('day'||d),plan->'confirmed','[]')) loop
   if pid='system-no-partner' then continue;end if;
   if not exists(select 1 from jsonb_array_elements(players) where value->>'id'=pid) then raise exception 'Daily golfer outside published roster';end if;
   slot=golf_safe_private.shared_slot(plan,pid);
   if plan->'sharedPositions' ? slot and plan->'sharedPositions'->slot->>('day'||d) is distinct from pid then raise exception 'Shared golfer assigned to a different day';end if;
  end loop;
 end loop;
end;$function$
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

CREATE OR REPLACE FUNCTION public.add_away_master_course_country(p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin raise exception 'Refresh Away Golf to use the shared master course store.' using errcode='55000';end $function$
;

CREATE OR REPLACE FUNCTION public.add_away_master_course_region(p_country text, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if not away_course_private.editor_access() then raise exception 'Owner or approved organiser-tablet access is required' using errcode='42501';end if;
 insert into public.away_master_course_regions(country,name)
 values(regexp_replace(trim(p_country),'\s+',' ','g'),regexp_replace(trim(p_name),'\s+',' ','g')) on conflict do nothing;
end;$function$
;

CREATE OR REPLACE FUNCTION public.away_course_library_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$select away_course_private.editor_access();$function$
;

CREATE OR REPLACE FUNCTION public.away_course_master_identity()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select jsonb_build_object('editor',away_course_private.editor_access(),'owner',exists(select 1 from away_course_private.administrators where user_id=auth.uid()));$function$
;

CREATE OR REPLACE FUNCTION public.away_event_invitation(p_join_code text)
 RETURNS TABLE(event_id uuid, event_name text, player_id text, display_name text, already_joined boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.name, ep.player_id, ep.display_name, ep.member_user_id is not null
  from public.away_events e
  join public.away_event_players ep on ep.event_id = e.id
  where e.join_code = upper(trim(p_join_code))
    and e.status <> 'archived'
  order by ep.display_name;
$function$
;

CREATE OR REPLACE FUNCTION public.away_event_spectator_count(p_event_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_away_event_organiser(p_event_id) then
    raise exception 'Organiser access is required';
  end if;
  return (
    select count(*)::integer
    from public.away_event_spectators
    where event_id = p_event_id
  );
end;
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
  );
$function$
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

CREATE OR REPLACE FUNCTION public.away_revoke_guests_when_event_closes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status in ('complete', 'archived')
     and old.status is distinct from new.status then
    update public.away_event_organisers
    set revoked_at = coalesce(revoked_at, now())
    where event_id = new.id and access_type = 'guest';
    delete from public.away_event_guest_keys where event_id = new.id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.away_touch_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  new.revision := old.revision + 1;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_write_away_round(p_event_id uuid, p_player_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_away_event_organiser(p_event_id) or exists (
    select 1 from public.away_event_players ep
    where ep.event_id = p_event_id
      and ep.player_id = p_player_id
      and ep.member_user_id = auth.uid()
  );
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
  limit 1;
  if v_event_id is not null then return v_event_id; end if;

  select e.id, k.access_hash into v_event_id, v_hash
  from public.away_events e
  join public.away_event_guest_keys k on k.event_id = e.id
  where e.join_code = upper(trim(p_join_code))
    and e.status not in ('complete', 'archived')
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

CREATE OR REPLACE FUNCTION public.claim_away_organiser_access(p_join_code text, p_access_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_event_id uuid; v_hash text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select e.id, k.access_hash into v_event_id, v_hash
  from public.away_events e
  join public.away_event_organiser_keys k on k.event_id = e.id
  where e.join_code = upper(trim(p_join_code)) and e.status <> 'archived'
  order by e.updated_at desc limit 1;
  if v_event_id is null or crypt(upper(trim(p_access_code)), v_hash) <> v_hash then
    raise exception 'The event code or organiser code is incorrect';
  end if;
  insert into public.away_event_organisers(event_id, user_id)
  values (v_event_id, auth.uid()) on conflict do nothing;
  return v_event_id;
end;
$function$
;

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
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Event name is required'; end if;
  if jsonb_typeof(coalesce(p_players, '[]'::jsonb)) <> 'array' then
    raise exception 'Players must be an array';
  end if;

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
    where e.id = p_event_id and e.organiser_id = auth.uid()
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

CREATE OR REPLACE FUNCTION public.create_away_organiser_key(p_event_id uuid)
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
    where e.id = p_event_id and e.organiser_id = auth.uid()
  ) and not exists (
    select 1 from public.away_event_organisers eo
    where eo.event_id = p_event_id and eo.user_id = auth.uid()
      and eo.access_type = 'tablet' and eo.revoked_at is null
  ) then
    raise exception 'Owner or organiser-tablet access is required';
  end if;
  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
  insert into public.away_event_organiser_keys(event_id, access_hash, updated_at)
  values (p_event_id, crypt(v_code, gen_salt('bf')), now())
  on conflict (event_id) do update
    set access_hash = excluded.access_hash, updated_at = now();
  return v_code;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.golf_add_location(p_country text, p_region text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin raise exception 'Refresh Away Golf to use the shared master course store.' using errcode='55000';end $function$
;

CREATE OR REPLACE FUNCTION public.golf_catalogue_reviews()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not (away_course_private.editor_access()) then raise exception 'Course review access required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'course_id',c.course_id,'name',c.incoming->>'name','incoming',c.incoming,'current',golf_catalogue_private.get_doc(c.course_id),'created_at',c.created_at) order by c.created_at) from golf_catalogue_private.conflicts c where status='pending'),'[]');
end $function$
;

CREATE OR REPLACE FUNCTION public.golf_receive_course(p_message jsonb, p_signature text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select golf_catalogue_private.receive(p_message,p_signature);$function$
;

CREATE OR REPLACE FUNCTION public.golf_resolve_course(p_id uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin raise exception 'Refresh Away Golf to review the shared master course store.' using errcode='55000';end $function$
;

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

CREATE OR REPLACE FUNCTION public.golf_safe_control(p_action text, p_args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare eid uuid=(p_args->>'event_id')::uuid;
begin
 if p_action='resolve' then select event_id into eid from golf_safe_private.conflicts where id=(p_args->>'id')::uuid;end if;
 return golf_safe_private.control(p_action,p_args,coalesce(public.is_away_event_organiser(eid),false),exists(select 1 from public.away_event_players where event_id=eid and member_user_id=auth.uid()));
end;$function$
;

CREATE OR REPLACE FUNCTION public.is_away_event_member(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.away_event_players ep
    where ep.event_id = p_event_id and ep.member_user_id = auth.uid()
  );
$function$
;

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
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_away_event_spectator(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.away_event_spectators s
      where s.event_id = p_event_id
        and s.user_id = auth.uid()
    );
$function$
;

CREATE OR REPLACE FUNCTION public.join_away_event(p_join_code text, p_player_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event_id uuid;
  v_member uuid;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;

  select ep.event_id, ep.member_user_id
    into v_event_id, v_member
  from public.away_event_players ep
  join public.away_events e on e.id = ep.event_id
  where e.join_code = upper(trim(p_join_code))
    and ep.player_id = p_player_id
    and e.status <> 'archived'
  for update of ep;

  if v_event_id is null then raise exception 'Event code or player is not valid'; end if;
  if v_member is not null and v_member <> auth.uid() then
    raise exception 'That player has already joined on another device';
  end if;

  update public.away_event_players
  set member_user_id = auth.uid(), joined_at = coalesce(joined_at, now())
  where event_id = v_event_id and player_id = p_player_id;

  return v_event_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revoke_away_guest_organiser(p_event_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (
    select 1 from public.away_events e
    where e.id = p_event_id and e.organiser_id = auth.uid()
  ) then
    raise exception 'Only the Owner Organiser can revoke delegated access';
  end if;
  update public.away_event_organisers
  set revoked_at = now()
  where event_id = p_event_id and access_type = 'guest' and revoked_at is null;
  delete from public.away_event_guest_keys where event_id = p_event_id;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_away_master_course(p_id text, p_data jsonb, p_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin raise exception 'Courses now use the shared master store. Refresh Away Golf before saving.' using errcode='55000';end $function$
;

CREATE OR REPLACE FUNCTION public.spectate_away_event(p_join_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event public.away_events%rowtype;
  v_result jsonb;
begin
  select * into v_event
  from public.away_events
  where join_code = upper(trim(p_join_code))
    and status <> 'archived'
  limit 1;

  if v_event.id is null then
    return null;
  end if;

  insert into public.away_event_spectators(event_id, user_id, last_seen)
  values (v_event.id, auth.uid(), now())
  on conflict (event_id, user_id) do update set last_seen = now();

  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event.id,
      'join_code', v_event.join_code,
      'name', v_event.name,
      'status', v_event.status,
      'event_data', v_event.event_data,
      'revision', v_event.revision,
      'updated_at', v_event.updated_at
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', ep.player_id,
        'display_name', ep.display_name,
        'player_data', ep.player_data,
        'joined_at', ep.joined_at
      ) order by ep.display_name)
      from public.away_event_players ep
      where ep.event_id = v_event.id
    ), '[]'::jsonb),
    'scores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', rs.day,
        'scorer_player_id', rs.scorer_player_id,
        'score_data', rs.score_data,
        'revision', rs.revision,
        'updated_at', rs.updated_at
      ))
      from public.away_round_scores rs
      where rs.event_id = v_event.id
    ), '[]'::jsonb),
    'spectator_count', (
      select count(*)::integer
      from public.away_event_spectators
      where event_id = v_event.id
    )
  ) into v_result;

  return v_result;
end;
$function$
;


revoke create on schema public from public,anon,authenticated;
revoke all on schema golf_catalogue_private,golf_safe_private from public,anon,authenticated;
grant usage on schema away_course_private to authenticated;
revoke all on all functions in schema public,away_course_private,golf_catalogue_private,golf_safe_private from public,anon,authenticated,service_role;
revoke all on all tables in schema public,away_course_private,golf_catalogue_private,golf_safe_private from public,anon,authenticated,service_role;

grant delete on table public.away_event_guest_keys to service_role;
grant insert on table public.away_event_guest_keys to service_role;
grant references on table public.away_event_guest_keys to service_role;
grant select on table public.away_event_guest_keys to service_role;
grant trigger on table public.away_event_guest_keys to service_role;
grant truncate on table public.away_event_guest_keys to service_role;
grant update on table public.away_event_guest_keys to service_role;
grant delete on table public.away_event_organiser_keys to authenticated;
grant insert on table public.away_event_organiser_keys to authenticated;
grant references on table public.away_event_organiser_keys to authenticated;
grant select on table public.away_event_organiser_keys to authenticated;
grant trigger on table public.away_event_organiser_keys to authenticated;
grant truncate on table public.away_event_organiser_keys to authenticated;
grant update on table public.away_event_organiser_keys to authenticated;
grant delete on table public.away_event_organiser_keys to service_role;
grant insert on table public.away_event_organiser_keys to service_role;
grant references on table public.away_event_organiser_keys to service_role;
grant select on table public.away_event_organiser_keys to service_role;
grant trigger on table public.away_event_organiser_keys to service_role;
grant truncate on table public.away_event_organiser_keys to service_role;
grant update on table public.away_event_organiser_keys to service_role;
grant delete on table public.away_event_organisers to authenticated;
grant insert on table public.away_event_organisers to authenticated;
grant references on table public.away_event_organisers to authenticated;
grant select on table public.away_event_organisers to authenticated;
grant trigger on table public.away_event_organisers to authenticated;
grant truncate on table public.away_event_organisers to authenticated;
grant update on table public.away_event_organisers to authenticated;
grant delete on table public.away_event_organisers to service_role;
grant insert on table public.away_event_organisers to service_role;
grant references on table public.away_event_organisers to service_role;
grant select on table public.away_event_organisers to service_role;
grant trigger on table public.away_event_organisers to service_role;
grant truncate on table public.away_event_organisers to service_role;
grant update on table public.away_event_organisers to service_role;
grant insert on table public.away_event_players to authenticated;
grant select on table public.away_event_players to authenticated;
grant update on table public.away_event_players to authenticated;
grant delete on table public.away_event_players to service_role;
grant insert on table public.away_event_players to service_role;
grant references on table public.away_event_players to service_role;
grant select on table public.away_event_players to service_role;
grant trigger on table public.away_event_players to service_role;
grant truncate on table public.away_event_players to service_role;
grant update on table public.away_event_players to service_role;
grant delete on table public.away_event_spectators to service_role;
grant insert on table public.away_event_spectators to service_role;
grant references on table public.away_event_spectators to service_role;
grant select on table public.away_event_spectators to service_role;
grant trigger on table public.away_event_spectators to service_role;
grant truncate on table public.away_event_spectators to service_role;
grant update on table public.away_event_spectators to service_role;
grant delete on table public.away_events to authenticated;
grant insert on table public.away_events to authenticated;
grant select on table public.away_events to authenticated;
grant delete on table public.away_events to service_role;
grant insert on table public.away_events to service_role;
grant references on table public.away_events to service_role;
grant select on table public.away_events to service_role;
grant trigger on table public.away_events to service_role;
grant truncate on table public.away_events to service_role;
grant update on table public.away_events to service_role;
grant select on table public.away_master_course_countries to authenticated;
grant delete on table public.away_master_course_countries to service_role;
grant insert on table public.away_master_course_countries to service_role;
grant references on table public.away_master_course_countries to service_role;
grant select on table public.away_master_course_countries to service_role;
grant trigger on table public.away_master_course_countries to service_role;
grant truncate on table public.away_master_course_countries to service_role;
grant update on table public.away_master_course_countries to service_role;
grant select on table public.away_master_course_history to authenticated;
grant delete on table public.away_master_course_history to service_role;
grant insert on table public.away_master_course_history to service_role;
grant references on table public.away_master_course_history to service_role;
grant select on table public.away_master_course_history to service_role;
grant trigger on table public.away_master_course_history to service_role;
grant truncate on table public.away_master_course_history to service_role;
grant update on table public.away_master_course_history to service_role;
grant insert on table public.away_master_course_regions to authenticated;
grant select on table public.away_master_course_regions to authenticated;
grant delete on table public.away_master_course_regions to service_role;
grant insert on table public.away_master_course_regions to service_role;
grant references on table public.away_master_course_regions to service_role;
grant select on table public.away_master_course_regions to service_role;
grant trigger on table public.away_master_course_regions to service_role;
grant truncate on table public.away_master_course_regions to service_role;
grant update on table public.away_master_course_regions to service_role;
grant select on table public.away_master_courses to authenticated;
grant delete on table public.away_master_courses to service_role;
grant insert on table public.away_master_courses to service_role;
grant references on table public.away_master_courses to service_role;
grant select on table public.away_master_courses to service_role;
grant trigger on table public.away_master_courses to service_role;
grant truncate on table public.away_master_courses to service_role;
grant update on table public.away_master_courses to service_role;
grant delete on table public.away_organiser_workspaces to authenticated;
grant insert on table public.away_organiser_workspaces to authenticated;
grant references on table public.away_organiser_workspaces to authenticated;
grant select on table public.away_organiser_workspaces to authenticated;
grant trigger on table public.away_organiser_workspaces to authenticated;
grant truncate on table public.away_organiser_workspaces to authenticated;
grant update on table public.away_organiser_workspaces to authenticated;
grant delete on table public.away_organiser_workspaces to service_role;
grant insert on table public.away_organiser_workspaces to service_role;
grant references on table public.away_organiser_workspaces to service_role;
grant select on table public.away_organiser_workspaces to service_role;
grant trigger on table public.away_organiser_workspaces to service_role;
grant truncate on table public.away_organiser_workspaces to service_role;
grant update on table public.away_organiser_workspaces to service_role;
grant delete on table public.away_round_scores to authenticated;
grant select on table public.away_round_scores to authenticated;
grant delete on table public.away_round_scores to service_role;
grant insert on table public.away_round_scores to service_role;
grant references on table public.away_round_scores to service_role;
grant select on table public.away_round_scores to service_role;
grant trigger on table public.away_round_scores to service_role;
grant truncate on table public.away_round_scores to service_role;
grant update on table public.away_round_scores to service_role;
grant delete on table public.golf_course_locations to authenticated;
grant insert on table public.golf_course_locations to authenticated;
grant references on table public.golf_course_locations to authenticated;
grant select on table public.golf_course_locations to authenticated;
grant trigger on table public.golf_course_locations to authenticated;
grant truncate on table public.golf_course_locations to authenticated;
grant update on table public.golf_course_locations to authenticated;
grant delete on table public.golf_course_locations to service_role;
grant insert on table public.golf_course_locations to service_role;
grant references on table public.golf_course_locations to service_role;
grant select on table public.golf_course_locations to service_role;
grant trigger on table public.golf_course_locations to service_role;
grant truncate on table public.golf_course_locations to service_role;
grant update on table public.golf_course_locations to service_role;
grant execute on function away_course_private.editor_access() to authenticated;
grant execute on function public.add_away_master_course_country(p_name text) to authenticated;
grant execute on function public.add_away_master_course_country(p_name text) to service_role;
grant execute on function public.add_away_master_course_region(p_country text, p_name text) to authenticated;
grant execute on function public.add_away_master_course_region(p_country text, p_name text) to service_role;
grant execute on function public.away_course_library_access() to authenticated;
grant execute on function public.away_course_library_access() to service_role;
grant execute on function public.away_course_master_identity() to authenticated;
grant execute on function public.away_course_master_identity() to service_role;
grant execute on function public.away_event_invitation(p_join_code text) to authenticated;
grant execute on function public.away_event_invitation(p_join_code text) to service_role;
grant execute on function public.away_event_spectator_count(p_event_id uuid) to authenticated;
grant execute on function public.away_event_spectator_count(p_event_id uuid) to service_role;
grant execute on function public.away_guest_organiser_active(p_event_id uuid) to authenticated;
grant execute on function public.away_guest_organiser_active(p_event_id uuid) to service_role;
grant execute on function public.away_master_gateway(p_action text, p_args jsonb, p_actor text, p_owner boolean, p_source text) to service_role;
grant execute on function public.can_write_away_round(p_event_id uuid, p_player_id text) to authenticated;
grant execute on function public.can_write_away_round(p_event_id uuid, p_player_id text) to service_role;
grant execute on function public.claim_away_guest_organiser_access(p_join_code text, p_access_code text) to authenticated;
grant execute on function public.claim_away_guest_organiser_access(p_join_code text, p_access_code text) to service_role;
grant execute on function public.claim_away_organiser_access(p_join_code text, p_access_code text) to authenticated;
grant execute on function public.claim_away_organiser_access(p_join_code text, p_access_code text) to service_role;
grant execute on function public.create_away_event(p_name text, p_event_data jsonb, p_players jsonb) to authenticated;
grant execute on function public.create_away_event(p_name text, p_event_data jsonb, p_players jsonb) to service_role;
grant execute on function public.create_away_guest_organiser_key(p_event_id uuid) to authenticated;
grant execute on function public.create_away_guest_organiser_key(p_event_id uuid) to service_role;
grant execute on function public.create_away_organiser_key(p_event_id uuid) to authenticated;
grant execute on function public.create_away_organiser_key(p_event_id uuid) to service_role;
grant execute on function public.golf_add_location(p_country text, p_region text) to authenticated;
grant execute on function public.golf_add_location(p_country text, p_region text) to service_role;
grant execute on function public.golf_catalogue_reviews() to authenticated;
grant execute on function public.golf_catalogue_reviews() to service_role;
grant execute on function public.golf_receive_course(p_message jsonb, p_signature text) to service_role;
grant execute on function public.golf_resolve_course(p_id uuid, p_accept boolean) to authenticated;
grant execute on function public.golf_resolve_course(p_id uuid, p_accept boolean) to service_role;
grant execute on function public.golf_safe_away_save(p_kind text, p_event_id uuid, p_day integer, p_player_id text, p_data jsonb, p_expected_revision bigint, p_correction boolean, p_reason text, p_status text) to authenticated;
grant execute on function public.golf_safe_away_save(p_kind text, p_event_id uuid, p_day integer, p_player_id text, p_data jsonb, p_expected_revision bigint, p_correction boolean, p_reason text, p_status text) to service_role;
grant execute on function public.golf_safe_control(p_action text, p_args jsonb) to authenticated;
grant execute on function public.golf_safe_control(p_action text, p_args jsonb) to service_role;
grant execute on function public.is_away_event_member(p_event_id uuid) to authenticated;
grant execute on function public.is_away_event_member(p_event_id uuid) to service_role;
grant execute on function public.is_away_event_organiser(p_event_id uuid) to authenticated;
grant execute on function public.is_away_event_organiser(p_event_id uuid) to service_role;
grant execute on function public.is_away_event_spectator(p_event_id uuid) to authenticated;
grant execute on function public.is_away_event_spectator(p_event_id uuid) to service_role;
grant execute on function public.join_away_event(p_join_code text, p_player_id text) to authenticated;
grant execute on function public.join_away_event(p_join_code text, p_player_id text) to service_role;
grant execute on function public.revoke_away_guest_organiser(p_event_id uuid) to authenticated;
grant execute on function public.revoke_away_guest_organiser(p_event_id uuid) to service_role;
grant execute on function public.save_away_master_course(p_id text, p_data jsonb, p_revision bigint) to authenticated;
grant execute on function public.save_away_master_course(p_id text, p_data jsonb, p_revision bigint) to service_role;
grant execute on function public.spectate_away_event(p_join_code text) to authenticated;
grant execute on function public.spectate_away_event(p_join_code text) to service_role;
grant execute on function public.away_retention_cleanup(boolean) to authenticated;
$baseline$;
 end if;
end;
$rebuild$;
drop trigger if exists golf_course_changed on public.away_master_courses;
drop trigger if exists golf_country_changed on public.away_master_course_countries;
drop trigger if exists golf_location_changed on public.golf_course_locations;
do $$declare job bigint;begin
 if to_regclass('cron.job') is not null then
   for job in select jobid from cron.job where jobname='golf-course-catalogue-retry' loop perform cron.unschedule(job);end loop;
 end if;
end;$$;
