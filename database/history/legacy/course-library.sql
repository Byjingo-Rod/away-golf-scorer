-- Shared Away Golf course catalogue; private authority comes from the verified owner.
-- Set away.course_owner_email privately for this database session before applying.
-- No owner email or generated user ID belongs in the public repository.
create schema if not exists away_course_private;
revoke all on schema away_course_private from public, anon;
grant usage on schema away_course_private to authenticated;
create table away_course_private.administrators(user_id uuid primary key references auth.users(id));
insert into away_course_private.administrators(user_id)
select id from auth.users where lower(email)=lower(current_setting('away.course_owner_email',true)) and email_confirmed_at is not null and not is_anonymous;
do $$begin if not exists(select 1 from away_course_private.administrators) then raise exception 'Set away.course_owner_email to the existing verified owner before applying';end if;end;$$;
revoke all on away_course_private.administrators from public, anon, authenticated;
create function away_course_private.editor_access() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and (
 exists(select 1 from away_course_private.administrators a where a.user_id=auth.uid())
 or exists(select 1 from public.away_event_organisers eo
 join public.away_events e on e.id=eo.event_id
 join away_course_private.administrators a on a.user_id=e.organiser_id
 where eo.user_id=auth.uid() and eo.access_type='tablet' and eo.revoked_at is null and e.status<>'archived'));
$$;
revoke all on function away_course_private.editor_access() from public,anon;
grant execute on function away_course_private.editor_access() to authenticated;
create function public.away_course_library_access() returns boolean language sql stable security invoker set search_path='' as $$select away_course_private.editor_access();$$;
revoke all on function public.away_course_library_access() from public,anon;
grant execute on function public.away_course_library_access() to authenticated;
create table public.away_master_courses (
 id text primary key check(length(id) between 1 and 120),
 data jsonb not null check(jsonb_typeof(data)='object' and data->>'id' is not null and data->>'id'=id and coalesce(length(trim(data->>'name')),0)>0 and octet_length(data::text)<200000),
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 updated_by uuid not null default auth.uid() references auth.users(id)
);
create table public.away_master_course_history (
 course_id text not null references public.away_master_courses(id), revision bigint not null,
 data jsonb not null, saved_at timestamptz not null, saved_by uuid not null references auth.users(id),
 primary key(course_id,revision)
);
create table public.away_master_course_countries(name text primary key check(length(trim(name)) between 1 and 100));
create unique index away_master_country_identity on public.away_master_course_countries(lower(trim(name)));
alter table public.away_master_courses enable row level security;
alter table public.away_master_course_history enable row level security;
alter table public.away_master_course_countries enable row level security;
revoke all on public.away_master_courses,public.away_master_course_history,public.away_master_course_countries from public,anon,authenticated;
grant select,insert,update on public.away_master_courses to authenticated;
grant select,insert on public.away_master_course_history,public.away_master_course_countries to authenticated;
create policy course_read on public.away_master_courses for select to authenticated using((select away_course_private.editor_access()));
create policy course_insert on public.away_master_courses for insert to authenticated with check((select away_course_private.editor_access()) and updated_by=(select auth.uid()));
create policy course_update on public.away_master_courses for update to authenticated using((select away_course_private.editor_access())) with check((select away_course_private.editor_access()) and updated_by=(select auth.uid()));
create policy history_read on public.away_master_course_history for select to authenticated using((select away_course_private.editor_access()));
create policy history_insert on public.away_master_course_history for insert to authenticated with check((select away_course_private.editor_access()) and saved_by=(select auth.uid()));
create policy country_read on public.away_master_course_countries for select to authenticated using((select away_course_private.editor_access()));
create policy country_insert on public.away_master_course_countries for insert to authenticated with check((select away_course_private.editor_access()));
create function away_course_private.course_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (tg_op='INSERT' and new.revision<>1) or (tg_op='UPDATE' and new.revision<>old.revision+1) then raise exception 'Invalid course revision'; end if;
 new.updated_at=now();new.updated_by=auth.uid();return new;
end;$$;
create function away_course_private.course_history() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.away_master_course_history(course_id,revision,data,saved_at,saved_by) values(new.id,new.revision,new.data,new.updated_at,new.updated_by);return new;
end;$$;
revoke all on function away_course_private.course_revision(),away_course_private.course_history() from public,anon,authenticated;
create trigger master_course_revision before insert or update on public.away_master_courses for each row execute function away_course_private.course_revision();
create trigger master_course_history after insert or update on public.away_master_courses for each row execute function away_course_private.course_history();
create function public.save_away_master_course(p_id text,p_data jsonb,p_revision bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row_data public.away_master_courses;
begin
 if not away_course_private.editor_access() then raise exception 'Owner or approved organiser-tablet access is required' using errcode='42501'; end if;
 if p_revision is null then
  insert into public.away_master_courses(id,data) values(p_id,p_data) on conflict(id) do nothing returning * into row_data;
 else
  update public.away_master_courses set data=p_data,revision=revision+1 where id=p_id and revision=p_revision returning * into row_data;
 end if;
 if row_data.id is null then raise exception 'This course has a newer cloud revision. Review both copies before saving.' using errcode='40001'; end if;
 return to_jsonb(row_data);
end;$$;
create function public.add_away_master_course_country(p_name text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not away_course_private.editor_access() then raise exception 'Owner or approved organiser-tablet access is required' using errcode='42501';end if;
 insert into public.away_master_course_countries(name) values(regexp_replace(trim(p_name),'\s+',' ','g')) on conflict do nothing;
end;$$;
revoke all on function public.save_away_master_course(text,jsonb,bigint),public.add_away_master_course_country(text) from public,anon;
grant execute on function public.save_away_master_course(text,jsonb,bigint),public.add_away_master_course_country(text) to authenticated;
create index away_master_course_editor on public.away_master_courses(updated_by);
create index away_master_course_history_editor on public.away_master_course_history(saved_by);
create index away_course_tablet_membership on public.away_event_organisers(user_id,event_id) where access_type='tablet' and revoked_at is null;
