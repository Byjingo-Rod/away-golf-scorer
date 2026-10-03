-- Golf Event Scorer project only: rlkyibpyezzoadowcdre.
-- Extends the existing roster without changing any Away Golf tables or project.
begin;
alter table public.ges_players add column if not exists details jsonb not null default '{}' check (jsonb_typeof(details)='object');
create or replace function public.ges_save_player_details(p_group_id uuid,p_player_id uuid,p_expected_revision bigint,p_details jsonb,p_ga numeric,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.ges_players; full_name text; field text; address_data jsonb;
begin
 if auth.uid() is null or not public.ges_can_access(p_group_id) or not exists(select 1 from public.ges_groups where id=p_group_id and enabled and setup_status='active') then
  raise exception 'Your organiser access or group activation is required.' using errcode='42501';
 end if;
 if p_player_id is null or p_expected_revision is null or p_active is null or jsonb_typeof(p_details) is distinct from 'object' then raise exception 'Incomplete player details'; end if;
 if length(trim(coalesce(p_details->>'firstName','')))=0 or length(trim(coalesce(p_details->>'lastName','')))=0 then raise exception 'First Name and Last Name are required'; end if;
 foreach field in array array['firstName','lastName','nickname','registration','cellPhone','homeClub','notes'] loop
  if p_details ? field and jsonb_typeof(p_details->field) <> 'string' then raise exception 'Invalid player field'; end if;
  if length(coalesce(p_details->>field,'')) > (case when field='notes' then 10000 when field='homeClub' then 160 else 80 end) then raise exception 'Player field is too long'; end if;
 end loop;
 address_data=coalesce(p_details->'addressDetails','{}');
 if jsonb_typeof(address_data)<>'object' then raise exception 'Invalid address'; end if;
 foreach field in array array['houseNo','streetName','streetType','otherStreetType','suburb','state','postCode','legacyAddress'] loop
  if address_data ? field and jsonb_typeof(address_data->field)<>'string' then raise exception 'Invalid address field'; end if;
  if length(coalesce(address_data->>field,''))>(case when field='legacyAddress' then 1000 else 160 end) then raise exception 'Address field is too long'; end if;
 end loop;
 if coalesce(address_data->>'streetType','') not in ('','Street','Rd','Close','Pde','Hwy','Other') then raise exception 'Choose a street type'; end if;
 if address_data->>'streetType'='Other' and length(trim(coalesce(address_data->>'otherStreetType','')))=0 then raise exception 'Please insert the other street type'; end if;
 if pg_column_size(p_details)>24000 then raise exception 'Player details are too large'; end if;
 full_name=trim(p_details->>'firstName')||' '||trim(p_details->>'lastName');
 if p_expected_revision=0 then
  insert into public.ges_players(id,group_id,name,ga,active,details) values(p_player_id,p_group_id,full_name,p_ga,p_active,p_details)
   on conflict(id) do nothing returning * into result;
  if result.id is null then
   select * into result from public.ges_players where id=p_player_id and group_id=p_group_id and revision=1 and details=p_details and ga is not distinct from p_ga and active=p_active;
   if result.id is null then raise exception 'Player already exists or changed. Refresh before saving.' using errcode='40001'; end if;
  end if;
 else
  update public.ges_players set name=full_name,ga=p_ga,active=p_active,details=p_details,revision=revision+1
   where id=p_player_id and group_id=p_group_id and revision=p_expected_revision returning * into result;
  if result.id is null then raise exception 'Player changed on another device. Refresh before saving.' using errcode='40001'; end if;
 end if;
 return to_jsonb(result);
end; $$;
revoke all on function public.ges_save_player_details(uuid,uuid,bigint,jsonb,numeric,boolean) from public,anon,authenticated;
grant execute on function public.ges_save_player_details(uuid,uuid,bigint,jsonb,numeric,boolean) to authenticated;
commit;
