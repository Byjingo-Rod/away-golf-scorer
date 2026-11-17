-- Keep the privileged implementation outside the exposed API schema.
create schema away_event_private;
revoke all on schema away_event_private from public,anon;
grant usage on schema away_event_private to authenticated;
alter function public.away_delete_test_event(uuid,text,bigint) set schema away_event_private;
revoke all on function away_event_private.away_delete_test_event(uuid,text,bigint) from public,anon;
grant execute on function away_event_private.away_delete_test_event(uuid,text,bigint) to authenticated;
create function public.away_delete_test_event(p_event_id uuid,p_confirmation text,p_expected_revision bigint) returns jsonb
language sql security invoker set search_path='' as $$
 select away_event_private.away_delete_test_event(p_event_id,p_confirmation,p_expected_revision);
$$;
revoke all on function public.away_delete_test_event(uuid,text,bigint) from public,anon;
grant execute on function public.away_delete_test_event(uuid,text,bigint) to authenticated;
