from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
COMMON=r'''
-- Course-only signed replication; no player, event, account or score replication.
create extension if not exists pg_net;
create extension if not exists pg_cron;
create schema if not exists golf_catalogue_private;
revoke all on schema golf_catalogue_private from public;
create table golf_catalogue_private.settings(singleton boolean primary key default true check(singleton),secret text not null,peer_url text not null,peer_key text not null);
create table golf_catalogue_private.outbox(id uuid primary key default gen_random_uuid(),course_id text not null,payload jsonb not null,request_id bigint,attempted_at timestamptz,delivered_at timestamptz,response jsonb,created_at timestamptz not null default now());
create table golf_catalogue_private.inbox(id uuid primary key,status text not null,received_at timestamptz not null default now());
create table golf_catalogue_private.conflicts(id uuid primary key,course_id text not null,local_hash text,incoming jsonb not null,status text not null default 'pending',created_at timestamptz not null default now());
create table golf_catalogue_private.history(id bigint generated always as identity primary key,course_id text not null,data jsonb not null,saved_at timestamptz not null default now());
create table public.golf_course_locations(country text not null,region text not null default '',primary key(country,region),check(length(country) between 1 and 100),check(length(region)<=100));
alter table public.golf_course_locations enable row level security;
grant select on public.golf_course_locations to authenticated;
create policy golf_location_read on public.golf_course_locations for select to authenticated using (__READ_ACCESS__);
insert into public.golf_course_locations values ('Australia','Bathurst/Orange'),('Australia','Canberra'),('Australia','Hunter Valley'),('Australia','Port Stephens'),('Australia','South Coast'),('Australia','Sydney'),('Australia','Wollongong');
create function golf_catalogue_private.normal(doc jsonb) returns jsonb language sql immutable set search_path='' as $$select doc-'id'-'acceptedAt'-'acceptedBy'-'activeScorecardTee'-'activeVersionId'-'versions';$$;
create function golf_catalogue_private.hash(doc jsonb) returns text language sql immutable set search_path='' as $$select case when doc is null then null else encode(extensions.digest(golf_catalogue_private.normal(doc)::text,'sha256'),'hex') end;$$;
__LOCAL_FUNCTIONS__
create function golf_catalogue_private.dispatch() returns void language plpgsql security definer set search_path='' as $$
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
end $$;
create function golf_catalogue_private.receive(p_message jsonb,p_signature text) returns jsonb language plpgsql security definer set search_path='' as $$
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
end $$;
create function public.golf_receive_course(p_message jsonb,p_signature text) returns jsonb language sql security invoker set search_path='' as $$select golf_catalogue_private.receive(p_message,p_signature);$$;
create function golf_catalogue_private.enqueue(cid text,doc jsonb,previous jsonb) returns void language plpgsql security definer set search_path='' as $$
declare mid uuid=gen_random_uuid();
begin
 if coalesce(current_setting('golf.catalogue_receiving',true),'off')='on' then return;end if;
 insert into golf_catalogue_private.outbox(id,course_id,payload) values(mid,cid,jsonb_build_object('message_id',mid,'course_id',cid,'kind','course','data',doc,'base_hash',golf_catalogue_private.hash(previous)));
 perform golf_catalogue_private.dispatch();
end $$;
create function golf_catalogue_private.location_change() returns trigger language plpgsql security definer set search_path='' as $$
declare mid uuid=gen_random_uuid();
begin
 if coalesce(current_setting('golf.catalogue_receiving',true),'off')<>'on' then
  insert into golf_catalogue_private.outbox(id,course_id,payload) values(mid,'location:'||new.country||':'||new.region,jsonb_build_object('message_id',mid,'course_id','location:'||new.country||':'||new.region,'kind','location','country',new.country,'region',new.region));perform golf_catalogue_private.dispatch();
 end if;return new;
end $$;
create trigger golf_location_changed after insert on public.golf_course_locations for each row execute function golf_catalogue_private.location_change();
create function public.golf_add_location(p_country text,p_region text default '') returns void language plpgsql security definer set search_path='' as $$
begin
 if not (__EDIT_ACCESS__) then raise exception 'Course edit access required' using errcode='42501';end if;
 insert into public.golf_course_locations values(regexp_replace(trim(p_country),'\s+',' ','g'),regexp_replace(trim(p_region),'\s+',' ','g')) on conflict do nothing;
end $$;
create function public.golf_catalogue_reviews() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not (__REVIEW_ACCESS__) then raise exception 'Course review access required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'course_id',c.course_id,'name',c.incoming->>'name','incoming',c.incoming,'current',golf_catalogue_private.get_doc(c.course_id),'created_at',c.created_at) order by c.created_at) from golf_catalogue_private.conflicts c where status='pending'),'[]');
end $$;
create function public.golf_resolve_course(p_id uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
declare c golf_catalogue_private.conflicts;doc jsonb;
begin
 if not (__REVIEW_ACCESS__) then raise exception 'Course review access required' using errcode='42501';end if;
 select * into c from golf_catalogue_private.conflicts where id=p_id and status='pending' for update;if not found then raise exception 'Review already completed';end if;
 perform pg_advisory_xact_lock(hashtextextended('golf-catalogue:'||c.course_id,0));doc=golf_catalogue_private.get_doc(c.course_id);
 if p_accept then
  if golf_catalogue_private.hash(doc) is distinct from c.local_hash then raise exception 'This course changed again. Reload before review.' using errcode='40001';end if;
  perform golf_catalogue_private.put_doc(c.course_id,c.incoming);
 else
  perform golf_catalogue_private.enqueue(c.course_id,doc,c.incoming);
 end if;
 update golf_catalogue_private.conflicts set status=case when p_accept then 'accepted' else 'kept' end where id=p_id;
end $$;
-- Only the signed receiver is available anonymously. Every private helper is revoked.
revoke all on all tables in schema golf_catalogue_private from public,anon,authenticated;
revoke all on all functions in schema golf_catalogue_private from public,anon,authenticated;
grant usage on schema golf_catalogue_private to anon,authenticated;
grant execute on function golf_catalogue_private.receive(jsonb,text) to anon,authenticated;
revoke all on function public.golf_receive_course(jsonb,text),public.golf_add_location(text,text),public.golf_catalogue_reviews(),public.golf_resolve_course(uuid,boolean) from public,anon,authenticated;
grant execute on function public.golf_receive_course(jsonb,text) to anon,authenticated;
grant execute on function public.golf_add_location(text,text),public.golf_catalogue_reviews(),public.golf_resolve_course(uuid,boolean) to authenticated;
select cron.schedule('golf-course-catalogue-retry','* * * * *','select golf_catalogue_private.dispatch()');
'''
AWAY=r'''
create function golf_catalogue_private.get_doc(cid text) returns jsonb language sql stable security definer set search_path='' as $$select data from public.away_master_courses where id=case when cid like 'away-%' then substr(cid,6) else 'ges-'||cid end;$$;
create function golf_catalogue_private.put_doc(cid text,doc jsonb) returns void language plpgsql security definer set search_path='' as $$
declare lid text=case when cid like 'away-%' then substr(cid,6) else 'ges-'||cid end;previous jsonb;
begin
 if auth.uid() is null then perform set_config('request.jwt.claim.sub',(select user_id::text from away_course_private.administrators order by user_id limit 1),true);end if;
 select data into previous from public.away_master_courses where id=lid;
 if previous is not null then insert into golf_catalogue_private.history(course_id,data) values(cid,previous);end if;
 insert into public.away_master_courses(id,data) values(lid,jsonb_set(doc,'{id}',to_jsonb(lid))) on conflict(id) do update set data=excluded.data,revision=away_master_courses.revision+1;
end $$;
create function golf_catalogue_private.course_change() returns trigger language plpgsql security definer set search_path='' as $$
declare cid text=case when new.id like 'ges-%' then substr(new.id,5) else 'away-'||new.id end;
begin
 if tg_op='UPDATE' then insert into golf_catalogue_private.history(course_id,data) values(cid,old.data);end if;
 insert into public.golf_course_locations values(coalesce(nullif(new.data->>'country',''),'Australia'),coalesce(new.data->>'region','')) on conflict do nothing;
 perform golf_catalogue_private.enqueue(cid,new.data,case when tg_op='UPDATE' then old.data else null end);return new;
end $$;
create function golf_catalogue_private.country_change() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.golf_course_locations(country,region) values(new.name,'') on conflict do nothing;return new;end $$;
create trigger golf_country_changed after insert on public.away_master_course_countries for each row execute function golf_catalogue_private.country_change();
create trigger golf_course_changed after insert or update of data on public.away_master_courses for each row execute function golf_catalogue_private.course_change();
'''
GES=r'''
create function golf_catalogue_private.get_doc(cid text) returns jsonb language sql stable security definer set search_path='' as $$select details||jsonb_build_object('name',name) from public.ges_courses where id=cid;$$;
create function golf_catalogue_private.put_doc(cid text,doc jsonb) returns void language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
 select details into previous from public.ges_courses where id=cid;
 if previous is not null then insert into golf_catalogue_private.history(course_id,data) values(cid,previous);end if;
 insert into public.ges_courses(id,name,details) values(cid,doc->>'name',doc) on conflict(id) do update set name=excluded.name,details=excluded.details,updated_at=clock_timestamp();
end $$;
create function golf_catalogue_private.course_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then insert into golf_catalogue_private.history(course_id,data) values(new.id,old.details);end if;
 insert into public.golf_course_locations values(coalesce(nullif(new.details->>'country',''),'Australia'),coalesce(new.details->>'region','')) on conflict do nothing;
 perform golf_catalogue_private.enqueue(new.id,new.details||jsonb_build_object('name',new.name),case when tg_op='UPDATE' then old.details||jsonb_build_object('name',old.name) else null end);return new;
end $$;
create trigger golf_course_changed after insert or update of details,name on public.ges_courses for each row execute function golf_catalogue_private.course_change();
'''
for kind,functions,read,edit,review in [('away',AWAY,'away_course_private.editor_access()','away_course_private.editor_access()','away_course_private.editor_access()'),('ges',GES,'public.ges_is_owner() or exists(select 1 from public.ges_groups g where public.ges_can_access(g.id))','public.ges_is_owner() or exists(select 1 from public.ges_groups g where public.ges_can_access(g.id))','public.ges_is_owner()')]:
 sql=COMMON.replace('__LOCAL_FUNCTIONS__',functions).replace('__READ_ACCESS__',read).replace('__EDIT_ACCESS__',edit).replace('__REVIEW_ACCESS__',review)
 (ROOT/'database'/f'course-bridge-{kind}.sql').write_text(sql)
