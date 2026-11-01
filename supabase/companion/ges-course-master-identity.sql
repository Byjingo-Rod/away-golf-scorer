-- Companion migration: Golf Event Scorer project ONLY.
-- The shared Away-owned gateway verifies GES membership through this narrow RPC.
create or replace function public.ges_course_master_identity()
returns jsonb language sql stable security definer set search_path='' as $$
 with owner as (select public.ges_is_owner() as allowed), groups as (
   select distinct g.id from public.ges_groups g
   join public.ges_organisers o on o.group_id=g.id
   join auth.users u on u.id=o.user_id
   where o.user_id=auth.uid() and o.enabled and o.approved_at is not null
     and g.enabled and g.setup_status='active' and g.archived_at is null
     and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 ), courses as (
   select distinct unnest(ges_private.ready_course_ids(id)) as id from groups
 )
 select jsonb_build_object('owner',owner.allowed,'editor',owner.allowed or exists(select 1 from groups),
   'courseIds',coalesce((select jsonb_agg(id order by id) from courses),'[]'::jsonb)) from owner;
$$;
revoke all on function public.ges_course_master_identity() from public,anon;
grant execute on function public.ges_course_master_identity() to authenticated;
