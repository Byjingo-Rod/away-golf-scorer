CREATE OR REPLACE FUNCTION public.claim_away_guest_organiser_access(p_join_code text, p_access_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_event_id uuid;
  v_hash text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;

  -- A network interruption after a successful claim must not strand the
  -- guest merely because the one-use invitation key has already been removed.
  select e.id into v_event_id
  from public.away_events e
  join public.away_event_organisers eo on eo.event_id = e.id
  where e.join_code = upper(trim(p_join_code))
    and eo.user_id = auth.uid()
    and eo.access_type = 'guest'
    and eo.revoked_at is null
    and e.status not in ('complete', 'archived')
      and coalesce(e.event_data->'event'->>'status','') not in ('complete','completed','archived')
      and nullif(e.event_data->'event'->'finalResults'->>'confirmedAt','') is null
  limit 1;
  if v_event_id is not null then return v_event_id; end if;

  select e.id, k.access_hash into v_event_id, v_hash
  from public.away_events e
  join public.away_event_guest_keys k on k.event_id = e.id
  where e.join_code = upper(trim(p_join_code))
    and e.status not in ('complete', 'archived')
      and coalesce(e.event_data->'event'->>'status','') not in ('complete','completed','archived')
      and nullif(e.event_data->'event'->'finalResults'->>'confirmedAt','') is null
    and k.expires_at > now()
  order by e.updated_at desc
  limit 1;

  if v_event_id is null or crypt(upper(trim(p_access_code)), v_hash) <> v_hash then
    raise exception 'The event code or Guest Organiser code is incorrect or expired';
  end if;

  insert into public.away_event_organisers(event_id, user_id, access_type, revoked_at)
  values (v_event_id, auth.uid(), 'guest', null)
  on conflict (event_id, user_id) do update set
    access_type = 'guest', revoked_at = null, granted_at = now();

  delete from public.away_event_guest_keys where event_id = v_event_id;
  return v_event_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_away_guest_organiser_key(p_event_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_code text;
begin
  if not exists (
    select 1 from public.away_events e
    where e.id = p_event_id and e.organiser_id = auth.uid() and e.status not in ('complete','archived') and coalesce(e.event_data->'event'->>'status','') not in ('complete','completed','archived') and nullif(e.event_data->'event'->'finalResults'->>'confirmedAt','') is null
  ) then
    raise exception 'Only the Owner Organiser can delegate an event';
  end if;

  -- One delegated planner at a time. Creating a replacement invitation
  -- immediately retires any earlier Guest Organiser for this event.
  update public.away_event_organisers
  set revoked_at = coalesce(revoked_at, now())
  where event_id = p_event_id and access_type = 'guest';

  v_code := upper(substr(encode(gen_random_bytes(10), 'hex'), 1, 10));
  insert into public.away_event_guest_keys(event_id, access_hash, created_at, expires_at)
  values (p_event_id, crypt(v_code, gen_salt('bf')), now(), now() + interval '14 days')
  on conflict (event_id) do update set
    access_hash = excluded.access_hash,
    created_at = now(),
    expires_at = now() + interval '14 days';
  return v_code;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_away_guest_organiser(p_event_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (
    select 1 from public.away_events e
    where e.id = p_event_id and e.organiser_id = auth.uid()
  ) then
    raise exception 'Only the Owner Organiser can revoke delegated access';
  end if;
  update public.away_event_organisers
  set revoked_at = now()
  where event_id = p_event_id and access_type = 'guest' and revoked_at is null;
  delete from public.away_event_guest_keys where event_id = p_event_id;
  return true;
end;
$function$;

