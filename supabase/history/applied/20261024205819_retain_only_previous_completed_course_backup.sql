
create or replace function away_course_private.course_history()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  delete from public.away_master_course_history
  where course_id = new.id;

  if tg_op = 'UPDATE'
     and nullif(btrim(old.data ->> 'masterAcceptedAt'), '') is not null
  then
    insert into public.away_master_course_history
      (course_id, revision, data, saved_at, saved_by)
    values
      (old.id, old.revision, old.data, clock_timestamp(), new.updated_by);
  end if;

  return new;
end;
$function$;

