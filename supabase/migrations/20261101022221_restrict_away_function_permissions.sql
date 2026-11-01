-- Away Golf Stage 2: restrict database function execution to intended callers.
revoke execute on all functions in schema public from public, anon;

revoke execute on function public.away_touch_revision()
  from authenticated, service_role;
revoke execute on function public.away_revoke_guests_when_event_closes()
  from authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

