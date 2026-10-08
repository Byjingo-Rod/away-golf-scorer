-- Approved organisers can correct their group's cards; the owner receives an audit notice.
create or replace function public.ges_can_edit_course(p_id text) returns boolean language sql stable security invoker set search_path='' as $$
select auth.uid() is not null and (public.ges_is_owner() or exists(select 1 from public.ges_groups g where g.enabled and g.setup_status='active' and p_id=any(g.requested_course_ids) and public.ges_can_access(g.id)));
$$;
revoke all on function public.ges_can_edit_course(text) from public,anon;
grant execute on function public.ges_can_edit_course(text) to authenticated;
create table public.golf_course_corrections(id uuid primary key default gen_random_uuid(),course_id text not null,course_name text not null,actor_user_id uuid not null references auth.users(id),previous_details jsonb not null,changed_details jsonb not null,reviewed boolean not null default false,created_at timestamptz not null default now());
alter table public.golf_course_corrections enable row level security;
grant select on public.golf_course_corrections to authenticated;
create policy golf_correction_read on public.golf_course_corrections for select to authenticated using ((select public.ges_is_owner()) or actor_user_id=(select auth.uid()));
create or replace function ges_private.save_course(p_course_id text,p_expected_updated_at timestamptz,p_name text,p_details jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.ges_courses; tee text; card jsonb; info jsonb; i integer; primary_indices integer[]; secondary_indices integer[]; v text; total integer;
begin
 if auth.uid() is null or not public.ges_can_edit_course(p_course_id) then raise exception 'Approved course editing access required.' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 160 or jsonb_typeof(p_details) is distinct from 'object' then raise exception 'Enter a course name and details.'; end if;
 if jsonb_typeof(p_details->'teeScorecards') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_details->'teeScorecards'))=0 then raise exception 'Complete at least one tee scorecard.'; end if;
 for tee,card in select * from jsonb_each(p_details->'teeScorecards') loop
  info=p_details->'teeDetails'->tee;
  if coalesce(info->>'slope','') !~ '^[0-9]+$' or coalesce(info->>'scratch','') !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Enter slope and scratch rating for the % tee.',tee; end if;
  if (info->>'slope')::numeric not between 55 and 155 or (info->>'scratch')::numeric not between 40 and 100 then raise exception 'Check slope and scratch rating for the % tee.',tee; end if;
  foreach v in array array['par','index','metres'] loop
   if jsonb_typeof(card->v) is distinct from 'array' or jsonb_array_length(card->v)<>18 then raise exception 'Complete all 18 holes for the % tee.',tee; end if;
  end loop;
  primary_indices='{}'; secondary_indices='{}'; total=0;
  for i in 0..17 loop
   if coalesce(card->'par'->>i,'') !~ '^[3-6]$' then raise exception 'Check par on hole % (% tee).',i+1,tee; end if;
   total=total+(card->'par'->>i)::integer;
   v=card->'index'->>i;
   if coalesce(v,'') !~ '^([1-9]|1[0-8])(/(1[9]|2[0-9]|3[0-6]))?$' then raise exception 'Check index on hole % (% tee).',i+1,tee; end if;
   if split_part(v,'/',1)::integer=any(primary_indices) then raise exception 'Duplicate index on the % tee.',tee; end if;
   primary_indices=array_append(primary_indices,split_part(v,'/',1)::integer);
   if position('/' in v)>0 then
    if split_part(v,'/',2)::integer=any(secondary_indices) then raise exception 'Duplicate secondary index on the % tee.',tee; end if;
    secondary_indices=array_append(secondary_indices,split_part(v,'/',2)::integer);
   end if;
   if coalesce(card->'metres'->>i,'') !~ '^[0-9]+$' then raise exception 'Enter metres on hole % (% tee).',i+1,tee; end if;
   if (card->'metres'->>i)::numeric not between 1 and 1000 then raise exception 'Check metres on hole % (% tee).',i+1,tee; end if;
  end loop;
  if card->>'distanceUnit'='yards' or card->>'distanceInputUnit'='yards' then
   if jsonb_typeof(card->'yards') is distinct from 'array' or jsonb_array_length(card->'yards')<>18 then raise exception 'Complete all 18 yardages';end if;
   for i in 0..17 loop
    if coalesce(card->'yards'->>i,'') !~ '^[0-9]+$' or (card->'yards'->>i)::integer not between 1 and 1100 or (card->'metres'->>i)::integer<>round((card->'yards'->>i)::numeric*0.9144) then raise exception 'Yardage/metres do not agree on hole %',i+1;end if;
   end loop;
  end if;
  if coalesce(info->>'par','')<>total::text then raise exception 'Tee par must match the sum of its holes.'; end if;
 end loop;
 update public.ges_courses set name=btrim(p_name),
 details=p_details||jsonb_build_object('name',btrim(p_name),'acceptedAt',case when public.ges_is_owner() then clock_timestamp() else null end,'acceptedBy',auth.uid()),updated_at=clock_timestamp()
 where id=p_course_id and updated_at=p_expected_updated_at returning * into saved;
 if not found then raise exception 'This course changed since you opened it. Reload the course before saving.' using errcode='40001'; end if;
 return to_jsonb(saved);
end $$;

revoke all on function ges_private.save_course(text,timestamptz,text,jsonb) from public,anon;
grant execute on function ges_private.save_course(text,timestamptz,text,jsonb) to authenticated;
create or replace function public.ges_save_course(p_course_id text,p_expected_updated_at timestamptz,p_name text,p_details jsonb) returns jsonb language sql security invoker set search_path='' as $$select ges_private.save_course(p_course_id,p_expected_updated_at,p_name,p_details);$$;
revoke all on function public.ges_save_course(text,timestamptz,text,jsonb) from public,anon;
grant execute on function public.ges_save_course(text,timestamptz,text,jsonb) to authenticated;
create function ges_private.course_correction_notice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and public.ges_can_edit_course(new.id) and not public.ges_is_owner() then
  insert into public.golf_course_corrections(course_id,course_name,actor_user_id,previous_details,changed_details) values(new.id,new.name,auth.uid(),old.details,new.details);
 end if;return new;
end $$;
revoke all on function ges_private.course_correction_notice() from public,anon,authenticated;
create trigger golf_course_correction after update of name,details on public.ges_courses for each row execute function ges_private.course_correction_notice();
create function public.golf_review_correction(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.ges_is_owner() then raise exception 'Owner access required' using errcode='42501';end if;
 update public.golf_course_corrections set reviewed=true where id=p_id;
end $$;
revoke all on function public.golf_review_correction(uuid) from public,anon;
grant execute on function public.golf_review_correction(uuid) to authenticated;
