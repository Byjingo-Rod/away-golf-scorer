create table public.away_master_course_regions (
 country text not null check(length(trim(country)) between 1 and 100),
 name text not null check(length(trim(name)) between 1 and 100),
 primary key(country,name)
);
create unique index away_master_region_identity on public.away_master_course_regions(lower(trim(country)),lower(trim(name)));
alter table public.away_master_course_regions enable row level security;
revoke all on public.away_master_course_regions from public,anon,authenticated;
grant select,insert on public.away_master_course_regions to authenticated;
create policy region_read on public.away_master_course_regions for select to authenticated using((select away_course_private.editor_access()));
create policy region_insert on public.away_master_course_regions for insert to authenticated with check((select away_course_private.editor_access()));
create function public.add_away_master_course_region(p_country text,p_name text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not away_course_private.editor_access() then raise exception 'Owner or approved organiser-tablet access is required' using errcode='42501';end if;
 insert into public.away_master_course_regions(country,name)
 values(regexp_replace(trim(p_country),'\s+',' ','g'),regexp_replace(trim(p_name),'\s+',' ','g')) on conflict do nothing;
end;$$;
revoke all on function public.add_away_master_course_region(text,text) from public,anon;
grant execute on function public.add_away_master_course_region(text,text) to authenticated;
insert into public.away_master_course_regions(country,name) values
 ('Australia','Bathurst/Orange'),('Australia','Canberra'),('Australia','Hunter Valley'),('Australia','Port Stephens'),('Australia','South Coast'),('Australia','Sydney'),('Australia','Wollongong');


