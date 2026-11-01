-- The normal catalogue exposes one current card only. For technical recovery,
-- retain exactly the immediately preceding accepted card. Proposed edits stay
-- isolated until the verified Owner accepts them.

create or replace function away_course_private.course_history()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  delete from public.away_master_course_history where course_id=new.id;
  if tg_op='UPDATE' then
    insert into public.away_master_course_history(course_id,revision,data,saved_at,saved_by)
    values(old.id,old.revision,old.data,clock_timestamp(),new.updated_by);
  end if;
  return new;
end;
$$;

-- Existing history originally included every revision, including the current
-- card. Keep only the newest revision that predates the current master.
with retained as (
  select h.course_id,max(h.revision) as revision
  from public.away_master_course_history h
  join public.away_master_courses m on m.id=h.course_id
  where h.revision<m.revision
  group by h.course_id
)
delete from public.away_master_course_history h
where not exists (
  select 1 from retained r
  where r.course_id=h.course_id and r.revision=h.revision
);

create or replace function public.away_master_gateway(
  p_action text,p_args jsonb,p_actor text,p_owner boolean,p_source text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
    delete from away_course_private.master_proposals where id=p.id;
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
$$;

revoke all on function public.away_master_gateway(text,jsonb,text,boolean,text) from public,anon,authenticated;
grant execute on function public.away_master_gateway(text,jsonb,text,boolean,text) to service_role;
