begin;
create or replace function public.ges_save_event(p_event_id uuid,p_expected_revision bigint,p_name text,p_date date,p_field_size integer,p_planning_data jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
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
  if allowed is null or not coalesce((plan->>'course1')=any(allowed),false) or
    (plan->>'days'='2' and not coalesce((plan->>'course2')=any(allowed),false)) then raise exception 'Choose owner-approved courses before saving'; end if;
  payload=jsonb_set(payload,'{courseSnapshots}',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'details',c.details,'updated_at',c.updated_at) order by c.id) from public.ges_courses c where c.id=plan->>'course1' or (plan->>'days'='2' and c.id=plan->>'course2')),'[]'));
 end if;
 update public.ges_events set name=trim(p_name),event_date=p_date,field_size=p_field_size,planning_data=payload,revision=revision+1,updated_at=now() where id=p_event_id returning revision into result;
 return result;
end; $$;
revoke all on function public.ges_save_event(uuid,bigint,text,date,integer,jsonb) from public,anon;
grant execute on function public.ges_save_event(uuid,bigint,text,date,integer,jsonb) to authenticated;
commit;
