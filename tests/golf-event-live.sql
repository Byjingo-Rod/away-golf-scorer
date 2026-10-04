begin;
do $$
declare owner_id uuid;gid uuid;cid text;pid1 uuid=gen_random_uuid();pid2 uuid=gen_random_uuid();pid3 uuid=gen_random_uuid();eid uuid;lid uuid;code text;tok text;tok2 text;res jsonb;plan jsonb;payload jsonb;rev bigint;
begin
 select user_id into owner_id from public.ges_owners limit 1;perform set_config('request.jwt.claim.sub',owner_id::text,true);
 select id into cid from public.ges_courses order by name limit 1;
 insert into public.ges_groups(name,setup_status,golfer_count,requested_course_ids) values('Live rollback fixture','active',2,array[cid]) returning id into gid;
 insert into public.ges_players(id,group_id,name,active) values(pid1,gid,'First Test',true),(pid2,gid,'Second Test',true);
 begin insert into public.ges_players(id,group_id,name,active) values(pid3,gid,'Third Test',true);raise exception 'Limit bypassed';exception when raise_exception then if SQLERRM='Limit bypassed' then raise;end if;end;
 insert into public.ges_players(id,group_id,name,active) values(pid3,gid,'Third Test',false);
 begin update public.ges_players set active=true where id=pid3;raise exception 'Reactivation limit bypassed';exception when raise_exception then if SQLERRM='Reactivation limit bypassed' then raise;end if;end;
 begin perform public.ges_create_event(gid,'Too large',current_date,3);raise exception 'Field limit bypassed';exception when raise_exception then if SQLERRM='Field limit bypassed' then raise;end if;end;
 eid=public.ges_create_event(gid,'Live test',current_date,2);
 plan=jsonb_build_object('name','Live test','date',current_date,'days',1,'fieldSize',2,'course1',cid,'course2',cid,'confirmed',jsonb_build_array(pid1,pid2),'locked',true,'gaHandicaps',jsonb_build_object(pid1::text,12.3,pid2::text,5.2));
 rev=public.ges_save_event(eid,1,'Live test',current_date,2,jsonb_build_object('event',plan));
 payload=jsonb_build_object('event',plan,'players',jsonb_build_array(jsonb_build_object('id',pid1,'name','Spoofed','cellPhone','secret'),jsonb_build_object('id',pid2,'name','Second Test')));
 res=public.ges_live('create',jsonb_build_object('draft_id',eid,'payload',payload));lid=(res->>'event_id')::uuid;code=res->>'join_code';
 if (public.ges_live('load',jsonb_build_object('event_id',lid))->'event'->'event_data'->'players')::text like '%secret%' then raise exception 'Contact leaked';end if;
 if public.ges_live('load',jsonb_build_object('event_id',lid))->'event'->'event_data'->'event'->'gaHandicaps'->>pid1::text<>'12.3' then raise exception 'Event GA lost';end if;
 update public.ges_players set ga=50 where id=pid1;
 if public.ges_live('load',jsonb_build_object('event_id',lid))->'event'->'event_data'->'event'->'gaHandicaps'->>pid1::text<>'12.3' then raise exception 'Profile GA changed historical event';end if;
 if (public.ges_live('create',jsonb_build_object('draft_id',eid,'payload',payload))->>'event_id')::uuid<>lid then raise exception 'Repeated publish changed event identity';end if;
 begin perform public.ges_live('update',jsonb_build_object('event_id',lid,'payload',payload,'expected_revision',1));raise exception 'Stale publication accepted';exception when serialization_failure then null;end;
 -- Public player API works without an organiser session.
 perform set_config('request.jwt.claim.sub','',true);
 if jsonb_array_length(public.ges_live('invitation',jsonb_build_object('code',code)))<>2 then raise exception 'Invitation failed';end if;
 res=public.ges_live('join',jsonb_build_object('code',code,'player_id',pid1));tok=res->>'token';
 res=public.ges_live('join',jsonb_build_object('code',code,'player_id',pid2));tok2=res->>'token';
 if public.ges_live('load',jsonb_build_object('event_id',lid,'token',tok))->'event'->>'name'<>'Live test' then raise exception 'Join/load failed';end if;
 res=public.ges_live('save_score',jsonb_build_object('event_id',lid,'token',tok,'player_id',pid1,'day',1,'score_data','{"1":{"gross":4}}'::jsonb));
 if res->>'revision'<>'1' then raise exception 'Score save failed';end if;
 begin perform public.ges_live('save_score',jsonb_build_object('event_id',lid,'token',tok2,'player_id',pid1,'day',1,'expected_revision',1,'score_data','{}'::jsonb));raise exception 'Other player overwrite allowed';exception when insufficient_privilege then null;end;
 begin perform public.ges_live('load',jsonb_build_object('event_id',lid));raise exception 'Unauthorised load allowed';exception when insufficient_privilege then null;end;
 begin perform public.ges_live('update',jsonb_build_object('event_id',lid,'token',tok,'payload',payload,'expected_revision',1));raise exception 'Player publication allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.ges_live('release',jsonb_build_object('event_id',lid,'player_id',pid1));
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.ges_live('load',jsonb_build_object('event_id',lid,'token',tok));raise exception 'Released token still works';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);update public.ges_groups set enabled=false where id=gid;
 begin perform public.ges_live('load',jsonb_build_object('event_id',lid,'token',tok2));raise exception 'Suspended group still works';exception when insufficient_privilege then null;end;
end $$;
-- Verify invoker wrapper grants for actual anonymous database role.
set local role anon;
select public.ges_live('invitation','{"code":"NOPE00"}');
rollback;
