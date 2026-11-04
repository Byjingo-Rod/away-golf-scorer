-- Serialize invitation creation, acceptance and revocation on the event row.
-- Preserve current lifecycle checks and reject null invitation secrets.
begin;
do $$declare definition text; name text; signature text; lock_sql text;begin
 foreach name in array array['create_away_guest_organiser_key','claim_away_guest_organiser_access','revoke_away_guest_organiser'] loop
  signature=case when name='claim_away_guest_organiser_access' then 'text,text' else 'uuid' end;
  select pg_get_functiondef(to_regprocedure('public.'||name||'('||signature||')')) into definition;
  definition=replace(definition,E'\r\n',E'\n');
  if definition is null or position(E'begin\n' in definition)=0 then raise exception 'Review current Guest Organiser definition: %',name;end if;
  lock_sql=case when name='claim_away_guest_organiser_access' then E'  if coalesce(upper(trim(p_join_code)),\'\') !~ \'^[A-Z0-9]{6}$\' or coalesce(upper(trim(p_access_code)),\'\') !~ \'^[A-Z0-9]{10}$\' then raise exception \'Enter both invitation codes\';end if;\n  perform 1 from public.away_events where join_code=upper(trim(p_join_code)) for update;\n' else E'  perform 1 from public.away_events where id=p_event_id for update;\n' end;
  definition=replace(definition,E'begin\n',E'begin\n'||lock_sql);
  if name='claim_away_guest_organiser_access' then
   definition=replace(definition,'crypt(upper(trim(p_access_code)), v_hash) <> v_hash','crypt(upper(trim(p_access_code)), v_hash) is distinct from v_hash');
  end if;
  execute definition;
 end loop;
end$$;
commit;
