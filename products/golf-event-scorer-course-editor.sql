-- Golf Event Scorer only. Owner editing of the shared course catalogue.
grant update (name,details,updated_at) on public.ges_courses to authenticated;
create policy ges_course_owner_update on public.ges_courses for update to authenticated
 using ((select public.ges_is_owner())) with check ((select public.ges_is_owner()));

create or replace function public.ges_save_course(p_course_id text,p_expected_updated_at timestamptz,p_name text,p_details jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.ges_courses; tee text; card jsonb; info jsonb; i integer; primary_indices integer[]; secondary_indices integer[]; v text; total integer;
begin
 if auth.uid() is null or not public.ges_is_owner() then raise exception 'Only the owner can edit courses.' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 160 or jsonb_typeof(p_details) is distinct from 'object' then raise exception 'Enter a course name and details.'; end if;
 if jsonb_typeof(p_details->'teeScorecards') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_details->'teeScorecards'))=0 then raise exception 'Complete at least one tee scorecard.'; end if;
 for tee,card in select * from jsonb_each(p_details->'teeScorecards') loop
  info=p_details->'teeDetails'->tee;
  if coalesce(info->>'slope','') !~ '^[0-9]+$' or coalesce(info->>'scratch','') !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Enter slope and scratch rating for the % tee.',tee; end if;
  if (info->>'slope')::numeric not between 55 and 155 or (info->>'scratch')::numeric not between 40 and 100 then raise exception 'Check slope and scratch rating for the % tee.',tee; end if;
  foreach v in array array['par','index','metres'] loop
   if jsonb_typeof(card->v) is distinct from 'array' or jsonb_array_length(card->v)<>18 then raise exception 'Complete all 18 holes for the % tee.',tee; end if;
  end loop;
  primary_indices='{}'; secondary_indices='{}'; total=0;
  for i in 0..17 loop
   if coalesce(card->'par'->>i,'') !~ '^[3-6]$' then raise exception 'Check par on hole % (% tee).',i+1,tee; end if;
   total=total+(card->'par'->>i)::integer;
   v=card->'index'->>i;
   if coalesce(v,'') !~ '^([1-9]|1[0-8])(/(1[9]|2[0-9]|3[0-6]))?$' then raise exception 'Check index on hole % (% tee).',i+1,tee; end if;
   if split_part(v,'/',1)::integer=any(primary_indices) then raise exception 'Duplicate index on the % tee.',tee; end if;
   primary_indices=array_append(primary_indices,split_part(v,'/',1)::integer);
   if position('/' in v)>0 then
    if split_part(v,'/',2)::integer=any(secondary_indices) then raise exception 'Duplicate secondary index on the % tee.',tee; end if;
    secondary_indices=array_append(secondary_indices,split_part(v,'/',2)::integer);
   end if;
   if coalesce(card->'metres'->>i,'') !~ '^[0-9]+$' then raise exception 'Enter metres on hole % (% tee).',i+1,tee; end if;
   if (card->'metres'->>i)::numeric not between 1 and 1000 then raise exception 'Check metres on hole % (% tee).',i+1,tee; end if;
  end loop;
  if coalesce(info->>'par','')<>total::text then raise exception 'Tee par must match the sum of its holes.'; end if;
 end loop;
 update public.ges_courses set name=btrim(p_name),
 details=p_details||jsonb_build_object('name',btrim(p_name),'acceptedAt',clock_timestamp(),'acceptedBy',auth.uid()),updated_at=clock_timestamp()
 where id=p_course_id and updated_at=p_expected_updated_at returning * into saved;
 if not found then raise exception 'This course changed since you opened it. Reload the course before saving.' using errcode='40001'; end if;
 return to_jsonb(saved);
end $$;
revoke all on function public.ges_save_course(text,timestamptz,text,jsonb) from public,anon;
grant execute on function public.ges_save_course(text,timestamptz,text,jsonb) to authenticated;
