
-- 1. Extensions
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 2. Generate cron secret in Vault (only if missing)
do $$
declare
  v_secret text;
begin
  if not exists (select 1 from vault.secrets where name = 'monitoring_cron_secret') then
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_secret, 'monitoring_cron_secret', 'Cron secret for master-monitoring-status edge function');
  end if;
end $$;

-- 3. Private helper to read the cron secret (service_role only)
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function app_private.get_monitoring_cron_secret()
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'monitoring_cron_secret'
  limit 1;
$$;

revoke all on function app_private.get_monitoring_cron_secret() from public, anon, authenticated;
grant execute on function app_private.get_monitoring_cron_secret() to service_role;

-- 4. Retention cleanup function (30 days)
create or replace function public.evolution_health_cleanup()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.evolution_health_snapshots
  where created_at < now() - interval '30 days';
$$;

revoke all on function public.evolution_health_cleanup() from public, anon, authenticated;
grant execute on function public.evolution_health_cleanup() to service_role;

-- 5. Schedule cron every 5 minutes — secret read from Vault at runtime, never literal
do $$
begin
  if exists (select 1 from cron.job where jobname = 'master-monitoring-cron') then
    perform cron.unschedule('master-monitoring-cron');
  end if;
end $$;

select cron.schedule(
  'master-monitoring-cron',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://ejelqgnjwprsunphlmdt.supabase.co/functions/v1/master-monitoring-status',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'monitoring_cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $cron$
);
