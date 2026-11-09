-- Read only identity/retention metadata for this device's cached event IDs.
begin;
create or replace function public.golf_storage_event_metadata(p_event_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if coalesce(cardinality(p_event_ids),0)>100 then raise exception 'Too many saved events';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',requested.id,'status',case when e.id is null then 'deleted' when coalesce(public.is_away_event_organiser(e.id),false) then e.status else 'unavailable' end)
 || case when e.id is not null and coalesce(public.is_away_event_organiser(e.id),false) then jsonb_build_object('name',e.name,'date',e.event_data->'event'->>'date','joinCode',e.join_code,'finished',(e.event_data->'event'->'awardedResults'->>'finishedAt' is not null),'confirmed',e.event_data->'event'->'finalResults'->>'confirmedAt' is not null) else '{}'::jsonb end)
 from (select distinct unnest(p_event_ids) id) requested left join public.away_events e on e.id=requested.id),'[]');
end;$$;
revoke all on function public.golf_storage_event_metadata(uuid[]) from public,anon;
grant execute on function public.golf_storage_event_metadata(uuid[]) to authenticated;
commit;
