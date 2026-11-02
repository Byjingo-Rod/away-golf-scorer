-- A drive selection or signed NTP claim also freezes the event-day layout.
CREATE OR REPLACE FUNCTION golf_safe_private.layout_started(eid uuid, d integer)
 RETURNS boolean
 LANGUAGE sql
 VOLATILE
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.away_round_scores s where s.event_id=eid and s.day=d and
   (nullif(s.score_data->'_finalScore'->>'confirmedAt','') is not null or exists(
     select 1 from jsonb_each(s.score_data) h where h.key ~ '^([1-9]|1[0-8])$' and
       (nullif(h.value->'self'->>'gross','') is not null or nullif(h.value->'official'->>'gross','') is not null or nullif(h.value->'self'->>'putts','') is not null or nullif(h.value->'official'->>'putts','') is not null))))
 or exists(select 1 from public.away_round_scores s cross join lateral jsonb_each(s.score_data) h where s.event_id=eid and s.day=d and h.key~'^([1-9]|1[0-8])$' and (nullif(h.value->'ambrose'->>'drivePlayerId','') is not null or nullif(h.value->'ntp'->>'confirmedAt','') is not null))
 or exists(select 1 from public.away_events e where e.id=eid and coalesce(e.event_data->'event'->'manualScorecards'->('day'||d)->'groups','{}')<>'{}'::jsonb);
$function$;
revoke all on function golf_safe_private.layout_started(uuid,integer) from public,anon,authenticated;
