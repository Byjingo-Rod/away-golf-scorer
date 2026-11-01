-- Away Golf Stage 2: restrict database function execution to intended callers.
--
-- Every Away Golf device signs in before calling the database. The raw `anon`
-- database role therefore requires no function execution privileges. Signed-in
-- devices use the `authenticated` role and retain only the existing deliberate
-- App gateways and the helpers required by row-level security policies.

revoke execute on all functions in schema public from public, anon;

-- Trigger functions are invoked by PostgreSQL itself. They are not API
-- endpoints and no Data API role needs permission to execute them directly.
revoke execute on function public.away_touch_revision()
  from authenticated, service_role;
revoke execute on function public.away_revoke_guests_when_event_closes()
  from authenticated, service_role;

-- New functions must be granted deliberately. This prevents PostgreSQL's
-- PUBLIC default and Supabase role defaults from silently creating new RPCs.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

