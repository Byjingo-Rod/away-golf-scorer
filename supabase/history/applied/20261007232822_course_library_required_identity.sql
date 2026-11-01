alter table public.away_master_courses add constraint master_course_required_identity check(data->>'id' is not null and coalesce(length(trim(data->>'name')),0)>0);
