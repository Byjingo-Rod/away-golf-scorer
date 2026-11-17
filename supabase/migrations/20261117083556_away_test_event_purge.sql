-- Exact event identities only: preserve shared players, courses and other events.
create or replace function golf_safe_private.purge_event_json(doc jsonb, ids text[], at_root boolean default true) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb; item jsonb; key text; value jsonb;
begin
 if jsonb_typeof(doc)='array' then
  result='[]';for item in select jsonb_array_elements(doc) loop
   value=golf_safe_private.purge_event_json(item,ids,false);if value is not null then result=result||jsonb_build_array(value);end if;
  end loop;return result;
 elsif jsonb_typeof(doc)='object' then
  if not at_root and exists(select 1 from unnest(array['id','workspaceId','eventId','event_id','publicationId','cloudEventId','pastCloudEventId','eventReference']) f where doc->>f=any(ids)) then return null;end if;
  if not at_root and not (doc ?| array['players','courses','eventWorkspace']) and (doc->'cloud'->>'eventId'=any(ids) or exists(select 1 from unnest(array['id','workspaceId','publicationId','cloudEventId','pastCloudEventId']) f where doc->'event'->>f=any(ids))) then return null;end if;
  result='{}';for key,item in select * from jsonb_each(doc) loop
   if key=any(ids) or exists(select 1 from unnest(ids) i where starts_with(key,i||':')) then continue;end if;
   value=golf_safe_private.purge_event_json(item,ids,false);if value is not null then result=result||jsonb_build_object(key,value);end if;
  end loop;return result;
 end if;return doc;
end;$$;
revoke all on function golf_safe_private.purge_event_json(jsonb,text[],boolean) from public,anon,authenticated;

create or replace function public.away_delete_test_event(p_event_id uuid,p_confirmation text,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.away_events;ids text[];
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select * into e from public.away_events where id=p_event_id for update;
 if not found then raise exception 'Event no longer exists' using errcode='PT410';end if;
 if e.organiser_id is distinct from auth.uid() then raise exception 'Original organiser access required' using errcode='42501';end if;
 if btrim(e.name) !~* '^TEST([^[:alnum:]_]|$)' then raise exception 'Only events whose first word is TEST can be purged' using errcode='42501';end if;
 if p_confirmation is distinct from e.name then raise exception 'Enter the exact event name to confirm';end if;
 if p_expected_revision is null or p_expected_revision<>e.revision then raise exception 'Event changed. Reload before deleting.' using errcode='PT409';end if;
 ids=array_remove(array[p_event_id::text,e.event_data->'event'->>'workspaceId',e.event_data->'event'->>'id',e.event_data->'event'->>'publicationId'],null);
 ids=array_remove(ids,'');
 -- The awarded-result trigger verifies the same identity, TEST name and owner.
 perform set_config('away.test_purge_event',p_event_id::text,true);
 delete from public.away_events where id=p_event_id;
 -- All event-dependent tables have ON DELETE CASCADE, including recovery copies.
 update public.away_organiser_workspaces set workspace_data=golf_safe_private.purge_event_json(workspace_data,ids),revision=revision+1,updated_at=now()
 where workspace_data is distinct from golf_safe_private.purge_event_json(workspace_data,ids);
 perform set_config('away.test_purge_event','',true);
 return jsonb_build_object('deleted',true,'id',p_event_id,'ids',ids);
end;$$;
revoke all on function public.away_delete_test_event(uuid,text,bigint) from public,anon;
grant execute on function public.away_delete_test_event(uuid,text,bigint) to authenticated;

create or replace function golf_safe_private.guard_awarded_results() returns trigger
language plpgsql security definer set search_path='' as $$
declare eid uuid; stamp text;
begin
 if tg_table_name='live_events' or tg_table_name='away_events' then
  if tg_op='DELETE' then
   if tg_table_name='away_events' and current_setting('away.test_purge_event',true)=old.id::text
     and auth.uid() is not null and old.organiser_id=auth.uid() and btrim(old.name) ~* '^TEST([^[:alnum:]_]|$)' then return old;end if;
   if old.event_data->'event'->'awardedResults'->>'finishedAt' is not null then raise exception 'GOLF_FINISHED: Awarded results must be retained' using errcode='42501';end if;return old;
  end if;
  if old.event_data->'event'->'awardedResults'->>'finishedAt' is not null and
    (new.event_data is distinct from old.event_data or new.status is distinct from old.status) then raise exception 'GOLF_FINISHED: Awarded results are final' using errcode='42501';end if;
  return new;
 end if;
 if tg_op='DELETE' then eid=old.event_id;else eid=new.event_id;end if;
 select event_data->'event'->'awardedResults'->>'finishedAt' into stamp from public.away_events where id=eid for update;
 if stamp is not null then raise exception 'GOLF_FINISHED: Awarded results are final' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;

-- Prevent an older reconnecting tab from restoring a dangling cloud pointer.
-- This field is a cache reference, never a retained scorecard or event plan.
create or replace function golf_safe_private.validate_workspace_event_pointer() returns trigger
language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
 if new.workspace_data->'activePublishedEvent'->>'eventId' is not null then
  begin eid=(new.workspace_data->'activePublishedEvent'->>'eventId')::uuid;
  exception when invalid_text_representation then eid=null;end;
  if eid is null or not exists(select 1 from public.away_events where id=eid) then
   new.workspace_data=new.workspace_data-'activePublishedEvent';
  end if;
 end if;return new;
end;$$;
revoke all on function golf_safe_private.validate_workspace_event_pointer() from public,anon,authenticated;
create trigger validate_workspace_event_pointer before insert or update of workspace_data on public.away_organiser_workspaces
for each row execute function golf_safe_private.validate_workspace_event_pointer();
