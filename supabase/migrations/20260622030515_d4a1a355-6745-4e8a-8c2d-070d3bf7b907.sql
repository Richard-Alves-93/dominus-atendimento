
create or replace function public.try_monitoring_cron_lock()
returns boolean
language sql
security definer
set search_path = public
as $$ select pg_try_advisory_lock(91823471); $$;

create or replace function public.release_monitoring_cron_lock()
returns boolean
language sql
security definer
set search_path = public
as $$ select pg_advisory_unlock(91823471); $$;

revoke all on function public.try_monitoring_cron_lock() from public, anon, authenticated;
revoke all on function public.release_monitoring_cron_lock() from public, anon, authenticated;
grant execute on function public.try_monitoring_cron_lock() to service_role;
grant execute on function public.release_monitoring_cron_lock() to service_role;
