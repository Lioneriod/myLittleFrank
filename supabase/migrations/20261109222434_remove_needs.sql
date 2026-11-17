do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'decay-needs-hourly';
  end if;
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    delete from vault.secrets where name in ('decay_needs_url', 'cron_secret');
  end if;
end;
$$;

drop function if exists public.decay_monster_needs(integer);

alter table public.monsters
  drop column if exists hunger,
  drop column if exists thirst,
  drop column if exists affection;
