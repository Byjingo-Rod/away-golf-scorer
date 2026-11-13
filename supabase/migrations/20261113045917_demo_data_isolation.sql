begin;
-- Explicit DEMO flags survive renaming; legacy TEST/DEMO names are conservatively excluded.
-- No existing scores, awards, profiles or events are rewritten by this migration.
create or replace function golf_safe_private.is_demonstration_event(p_name text,p_data jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select 
 coalesce(p_name,'') ~* '(^|[^[:alnum:]_])(TEST|DEMO|DEMONSTRATION)([^[:alnum:]_]|$)' or
 coalesce(p_data->'event'->>'testMode','false')='true' or
 coalesce(p_data->'event'->>'ridgeTestMode','false')='true' or
 coalesce(p_data->'event'->>'demonstration','false')='true' or
 nullif(p_data->'event'->>'demoBatch','') is not null or
 coalesce(p_data->'event'->'awardedResults'->>'test','false')='true' or
 exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p_data->'players')='array' then p_data->'players' else '[]'::jsonb end) p where nullif(p->>'demoBatch','') is not null);
$$;
revoke all on function golf_safe_private.is_demonstration_event(text,jsonb) from public,anon,authenticated;

create or replace function public.golf_finish_awarded_event(p_event_id uuid,p_snapshot jsonb,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.away_events; snapshot jsonb; revisions jsonb; cards jsonb; legacy boolean; receipt jsonb; compact jsonb;
begin
 if auth.uid() is null or not coalesce(public.is_away_event_organiser(p_event_id),false) then raise exception 'Organiser access required' using errcode='42501';end if;
 select * into e from public.away_events where id=p_event_id for update;
 if not found then raise exception 'Event unavailable';end if;
 if e.event_data->'event'->'awardedResults'->>'finishedAt' is not null then return e.event_data->'event'->'awardedResults';end if;
 if e.revision is distinct from p_expected_revision then raise exception 'Results changed. Reload before finishing' using errcode='40001';end if;
 select coalesce(jsonb_object_agg(day::text||':'||scorer_player_id,revision),'{}') into revisions from public.away_round_scores s where event_id=p_event_id;
 legacy=e.status='archived' and e.event_data->'event'->'finalResults'->>'confirmedAt' is not null and e.event_data->'event'->'finalResults'->>'cloudAcceptedAt' is null;
 if legacy then
  if p_snapshot->>'legacy' is distinct from 'true' or jsonb_typeof(e.event_data->'event'->'finalResults'->'outcomes') is distinct from 'object' then raise exception 'Original awarded outcomes are required for legacy preservation';end if;
  snapshot=jsonb_build_object('version',2,'legacy',true,'eventId',p_event_id,'name',e.name,'date',e.event_data->'event'->>'date','originalFinalResults',e.event_data->'event'->'finalResults','rounds','[]'::jsonb,'competitions','[]'::jsonb,'historicalLeaderboardAvailable',false);
 else
  if e.event_data->'event'->'finalResults'->>'cloudAcceptedAt' is null then raise exception 'Final online sign-off required';end if;
  if p_snapshot->>'signoff' is distinct from e.event_data->'event'->'finalResults'->>'confirmedAt' or p_snapshot->>'eventId' is distinct from p_event_id::text then raise exception 'Invalid awarded sign-off';end if;
  if revisions is distinct from e.event_data->'event'->'finalResults'->'acceptedScoreRevisions' then raise exception 'Scorecards changed after sign-off';end if;
  select coalesce(jsonb_object_agg(d,c),'{}') into cards from (select day::text d,jsonb_object_agg(scorer_player_id,score_data) c from public.away_round_scores s where event_id=p_event_id group by day) days;
  perform golf_safe_private.validate_awarded_snapshot(e.event_data->'event',coalesce(e.event_data->'courses','[]'),cards,p_snapshot);
  snapshot=p_snapshot;
 end if;
 receipt=jsonb_build_object('schema',2,'eventId',p_event_id,'workspaceId',e.event_data->'event'->>'workspaceId','acceptedScoreRevisions',revisions,'sourceDigest',encode(sha256(convert_to(e.event_data::text||revisions::text,'UTF8')),'hex'),'clearedReviews',(select count(*) from golf_safe_private.conflicts where event_id=p_event_id),'clearedCorrections',(select count(*) from golf_safe_private.corrections where event_id=p_event_id));
 snapshot=snapshot||jsonb_build_object('finishedAt',clock_timestamp(),'finishedBy',auth.uid(),'name',e.name,'date',e.event_data->'event'->>'date','retentionReceipt',receipt,'test',golf_safe_private.is_demonstration_event(e.name,e.event_data),'originalOutcomes',coalesce(e.event_data->'event'->'finalResults'->'outcomes','{}'));
 
 compact=golf_safe_private.compact_awarded_document(e.event_data,snapshot);
 update public.away_events set event_data=compact,status='archived'  where id=p_event_id;
 
 delete from golf_safe_private.conflicts where event_id=p_event_id;
 delete from golf_safe_private.corrections where event_id=p_event_id;
 
 return snapshot;
end;$$;
revoke all on function public.golf_finish_awarded_event(uuid,jsonb,bigint) from public,anon;
grant execute on function public.golf_finish_awarded_event(uuid,jsonb,bigint) to authenticated;

commit;
