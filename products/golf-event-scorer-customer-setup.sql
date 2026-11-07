-- Apply after golf-event-scorer-database.sql, in Golf Event Scorer only.
begin;
create table public.ges_courses (
  id text primary key,
  name text not null check (char_length(trim(name)) between 1 and 160),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.ges_courses enable row level security;
-- Use a checked helper instead of querying the protected auth schema in RLS.
create function public.ges_verified_account() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and not coalesce(is_anonymous,false));
$$;
create policy ges_course_read on public.ges_courses for select to authenticated using ((select public.ges_verified_account()));
revoke all on public.ges_courses from public,anon,authenticated;
grant select on public.ges_courses to authenticated;

alter table public.ges_groups
 add column setup_status text not null default 'awaiting_setup' check(setup_status in ('awaiting_setup','pending_review','active')),
 add column golfer_count integer check(golfer_count between 1 and 10000),
 add column requested_course_ids text[] not null default '{}',
 add column additional_courses text not null default '' check(char_length(additional_courses)<=2000),
 add column setup_revision bigint not null default 1,
 add column submitted_by uuid references auth.users(id),
 add column submitted_at timestamptz,
 add column reviewed_by uuid references auth.users(id),
 add column reviewed_at timestamptz;

-- Account approval permits onboarding; activation separately permits planning.
create function public.ges_can_setup(p_group_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.ges_is_owner() or (public.ges_verified_account() and exists (
 select 1 from public.ges_organisers m join public.ges_groups g on g.id=m.group_id
 where m.group_id=p_group_id and m.user_id=auth.uid() and m.enabled and g.enabled));
$$;
create or replace function public.ges_can_access(p_group_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.ges_is_owner() or (public.ges_can_setup(p_group_id) and exists(
 select 1 from public.ges_groups where id=p_group_id and setup_status='active'));
$$;
drop policy ges_group_read on public.ges_groups;
create policy ges_group_read on public.ges_groups for select to authenticated using(public.ges_can_setup(id));

create function public.ges_rename_group(p_group_id uuid,p_name text,p_expected_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.ges_is_owner() then raise exception 'Owner approval required' using errcode='42501'; end if;
 update public.ges_groups set name=trim(p_name),setup_revision=setup_revision+1 where id=p_group_id and setup_revision=p_expected_revision;
 if not found then raise exception 'Customer changed. Refresh before saving.' using errcode='40001'; end if;
end; $$;

create function public.ges_submit_setup(p_group_id uuid,p_expected_revision bigint,p_golfer_count integer,p_course_ids text[],p_additional_courses text) returns void
language plpgsql security definer set search_path='' as $$
declare target public.ges_groups; ids text[];
begin
 if not public.ges_can_setup(p_group_id) then raise exception 'Group access denied' using errcode='42501'; end if;
 select * into target from public.ges_groups where id=p_group_id for update;
 if not found or not target.enabled then raise exception 'Group access suspended' using errcode='42501'; end if;
 if target.setup_revision is distinct from p_expected_revision then raise exception 'Setup changed. Refresh before submitting.' using errcode='40001'; end if;
 if p_golfer_count is null or p_golfer_count not between 1 and 10000 then raise exception 'Enter the number of golfers in your group'; end if;
 select coalesce(array_agg(distinct v order by v),'{}') into ids from unnest(coalesce(p_course_ids,'{}')) v;
 if exists(select 1 from unnest(ids) v where v is null or not exists(select 1 from public.ges_courses c where c.id=v)) then raise exception 'Choose courses from the included list'; end if;
 if cardinality(ids)=0 and trim(coalesce(p_additional_courses,''))='' then raise exception 'Select a course or request another course'; end if;
 update public.ges_groups set golfer_count=p_golfer_count,requested_course_ids=ids,
 additional_courses=trim(coalesce(p_additional_courses,'')),setup_status='pending_review',
 setup_revision=setup_revision+1,submitted_by=auth.uid(),submitted_at=now(),reviewed_by=null,reviewed_at=null where id=p_group_id;
end; $$;

create function public.ges_activate_group(p_group_id uuid,p_expected_revision bigint,p_checked_course_ids text[],p_additional_checked boolean) returns void
language plpgsql security definer set search_path='' as $$
declare target public.ges_groups;
begin
 if not public.ges_is_owner() then raise exception 'Owner approval required' using errcode='42501'; end if;
 select * into target from public.ges_groups where id=p_group_id for update;
 if not found then raise exception 'Group not found'; end if;
 if target.setup_revision is distinct from p_expected_revision then raise exception 'Setup changed. Refresh and review the current request.' using errcode='40001'; end if;
 if not target.enabled or target.setup_status<>'pending_review' then raise exception 'An enabled group with a submitted setup is required'; end if;
 if not (target.requested_course_ids <@ coalesce(p_checked_course_ids,'{}')) then raise exception 'Check every requested course before activation'; end if;
 if target.additional_courses<>'' and not coalesce(p_additional_checked,false) then raise exception 'Resolve the additional course request before activation'; end if;
 update public.ges_groups set setup_status='active',setup_revision=setup_revision+1,reviewed_by=auth.uid(),reviewed_at=now() where id=p_group_id;
end; $$;
revoke all on function public.ges_verified_account(),public.ges_can_setup(uuid),public.ges_rename_group(uuid,text,bigint),public.ges_submit_setup(uuid,bigint,integer,text[],text),public.ges_activate_group(uuid,bigint,text[],boolean) from public,anon,authenticated;
grant execute on function public.ges_verified_account(),public.ges_can_setup(uuid),public.ges_rename_group(uuid,text,bigint),public.ges_submit_setup(uuid,bigint,integer,text[],text),public.ges_activate_group(uuid,bigint,text[],boolean) to authenticated;
commit;
