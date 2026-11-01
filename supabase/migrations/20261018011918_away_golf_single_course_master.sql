
create table if not exists away_course_private.master_proposals(
 id uuid primary key default gen_random_uuid(),
 course_id text not null,
 base_revision bigint,
 incoming jsonb not null,
 actor text not null,
 source text not null check(source in ('away','ges')),
 status text not null default 'pending' check(status in ('pending','accepted','kept')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by text
);
create index if not exists master_proposals_pending on away_course_private.master_proposals(status,created_at);

create or replace function away_course_private.course_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if (tg_op='INSERT' and new.revision<>1) or (tg_op='UPDATE' and new.revision<>old.revision+1) then raise exception 'Invalid course revision'; end if;
 new.updated_at=now();
 new.updated_by=coalesce(auth.uid(),new.updated_by);
 if new.updated_by is null then raise exception 'Course editor identity is required' using errcode='42501';end if;
 return new;
end $$;

create or replace function away_course_private.write_master_course(cid text,doc jsonb,expected bigint,actor text,owner boolean,source text) returns jsonb
language plpgsql security definer set search_path='' as $$
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
end $$;

create or replace function public.away_master_gateway(p_action text,p_args jsonb,p_actor text,p_owner boolean,p_source text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cid text; result jsonb; p away_course_private.master_proposals; c public.away_master_courses; system_owner uuid;
begin
 if p_source not in ('away','ges') or btrim(coalesce(p_actor,''))='' then raise exception 'Verified source required' using errcode='42501';end if;
 cid=p_args->>'id';
 if p_action='load' then
   return jsonb_build_object(
    'courses',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'data',m.data,'revision',m.revision,'updated_at',m.updated_at) order by m.id),'[]') from public.away_master_courses m),
    'locations',(select coalesce(jsonb_agg(jsonb_build_object('country',r.country,'region',r.name) order by r.country,r.name),'[]') from public.away_master_course_regions r),
    'authority','away-master-v2',
    'proposals',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'course_id',q.course_id,'status',q.status)),'[]') from away_course_private.master_proposals q where q.actor=p_source||':'||p_actor)
   );
 elsif p_action='get' then
   select jsonb_build_object('id',m.id,'data',m.data,'revision',m.revision,'updated_at',m.updated_at) into result from public.away_master_courses m where m.id=cid;return result;
 elsif p_action='save' then
   return away_course_private.write_master_course(cid,p_args->'data',(p_args->>'revision')::bigint,p_source||':'||p_actor,p_owner,p_source);
 elsif p_action='history' then
   return coalesce((select jsonb_agg(jsonb_build_object('revision',h.revision,'data',h.data,'saved_at',h.saved_at) order by h.revision desc) from (select * from public.away_master_course_history where course_id=cid order by revision desc limit 20) h),'[]');
 elsif p_action='reviews' then
   if not p_owner then raise exception 'Owner access required' using errcode='42501';end if;
   return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'course_id',q.course_id,'name',coalesce(m.data->>'name',q.incoming->>'name'),'incoming',q.incoming,'current',m.data,'revision',m.revision,'base_revision',q.base_revision,'source',q.source,'created_at',q.created_at) order by q.created_at) from away_course_private.master_proposals q left join public.away_master_courses m on m.id=q.course_id where q.status='pending'),'[]');
 elsif p_action='resolve' then
   if not p_owner then raise exception 'Owner access required' using errcode='42501';end if;
   select * into p from away_course_private.master_proposals where id=(p_args->>'proposal_id')::uuid and status='pending' for update;
   if p.id is null then raise exception 'Course proposal is no longer pending';end if;
   if coalesce((p_args->>'accept')::boolean,false) then
     perform away_course_private.write_master_course(p.course_id,p.incoming,p.base_revision,p_source||':'||p_actor,true,p_source);
     update away_course_private.master_proposals set status='accepted',reviewed_at=clock_timestamp(),reviewed_by=p_source||':'||p_actor where id=p.id;
   else update away_course_private.master_proposals set status='kept',reviewed_at=clock_timestamp(),reviewed_by=p_source||':'||p_actor where id=p.id;end if;
   return jsonb_build_object('ok',true);
 elsif p_action='location' then
   if not p_owner then raise exception 'Owner access required' using errcode='42501';end if;
   insert into public.away_master_course_countries(name) values(btrim(p_args->>'country')) on conflict do nothing;
   if btrim(coalesce(p_args->>'region',''))<>'' then insert into public.away_master_course_regions(country,name) values(btrim(p_args->>'country'),btrim(p_args->>'region')) on conflict do nothing;end if;
   return jsonb_build_object('ok',true);
 else raise exception 'Unknown course action';
 end if;
end $$;
revoke all on function public.away_master_gateway(text,jsonb,text,boolean,text) from public,anon,authenticated;
grant execute on function public.away_master_gateway(text,jsonb,text,boolean,text) to service_role;


