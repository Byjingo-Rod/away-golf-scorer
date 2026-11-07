-- Awarded results are authoritative. Apply before deploying the matching client.
-- No existing event is finished or deleted by installing this change.
begin;
create or replace function public.golf_finish_awarded_event(p_event_id uuid,p_snapshot jsonb,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.away_events; snapshot jsonb; revisions jsonb;
begin
 if auth.uid() is null or not coalesce(public.is_away_event_organiser(p_event_id),false) then raise exception 'Organiser access required' using errcode='42501';end if;
 select * into e from public.away_events where id=p_event_id for update;
 if not found then raise exception 'Event unavailable';end if;
 if e.event_data->'event'->'awardedResults'->>'finishedAt' is not null then return e.event_data->'event'->'awardedResults';end if;
 if e.revision is distinct from p_expected_revision then raise exception 'Results changed. Reload before finishing' using errcode='40001';end if;
 if e.event_data->'event'->'finalResults'->>'cloudAcceptedAt' is null then raise exception 'Final online sign-off required';end if;
 if p_snapshot->>'signoff' is distinct from e.event_data->'event'->'finalResults'->>'confirmedAt'
 or p_snapshot->>'eventId' is distinct from p_event_id::text or p_snapshot->>'version' is distinct from '1'
 or jsonb_typeof(p_snapshot->'rounds') is distinct from 'array' or jsonb_typeof(p_snapshot->'competitions') is distinct from 'array'
 then raise exception 'Invalid awarded results';end if;
 select coalesce(jsonb_object_agg(day::text||':'||scorer_player_id,revision),'{}') into revisions from public.away_round_scores where event_id=p_event_id;
 if revisions is distinct from e.event_data->'event'->'finalResults'->'acceptedScoreRevisions' then raise exception 'Scorecards changed after sign-off';end if;
 snapshot=p_snapshot||jsonb_build_object('finishedAt',clock_timestamp(),'finishedBy',auth.uid(),'name',e.name,'date',e.event_data->'event'->>'date');
 update public.away_events set event_data=jsonb_set(event_data,'{event,awardedResults}',snapshot),status='archived' where id=p_event_id;
 
 delete from golf_safe_private.conflicts where event_id=p_event_id;
 delete from golf_safe_private.corrections where event_id=p_event_id;
 
 return snapshot;
end;$$;
revoke all on function public.golf_finish_awarded_event(uuid,jsonb,bigint) from public,anon;
grant execute on function public.golf_finish_awarded_event(uuid,jsonb,bigint) to authenticated;
-- Independent guards also stop older installed clients and audited correction routes.
create or replace function golf_safe_private.guard_awarded_results() returns trigger language plpgsql security definer set search_path='' as $$
declare eid uuid; stamp text;
begin
 if tg_table_name='live_events' or tg_table_name='away_events' then
  if tg_op='DELETE' then
   if old.event_data->'event'->'awardedResults'->>'finishedAt' is not null then raise exception 'GOLF_FINISHED: Awarded results must be retained' using errcode='42501';end if;return old;
  end if;
  if old.event_data->'event'->'awardedResults'->>'finishedAt' is not null and
    (new.event_data is distinct from old.event_data or new.status is distinct from old.status) then raise exception 'GOLF_FINISHED: Awarded results are final' using errcode='42501';end if;
  return new;
 end if;
 if tg_op='DELETE' then eid=old.event_id;else eid=new.event_id;end if;
 select event_data->'event'->'awardedResults'->>'finishedAt' into stamp from public.away_events where id=eid for update;
 if stamp is not null then raise exception 'GOLF_FINISHED: Awarded results are final' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function golf_safe_private.guard_awarded_results() from public,anon,authenticated;
create trigger golf_awarded_event_guard before update or delete on public.away_events for each row execute function golf_safe_private.guard_awarded_results();
create trigger golf_awarded_score_guard before insert or update or delete on public.away_round_scores for each row execute function golf_safe_private.guard_awarded_results();
create trigger golf_awarded_conflicts_guard before insert on golf_safe_private.conflicts for each row execute function golf_safe_private.guard_awarded_results();
create trigger golf_awarded_corrections_guard before insert on golf_safe_private.corrections for each row execute function golf_safe_private.guard_awarded_results();
commit;
