do $$
declare
  j record;
  base_command text;
begin
  for j in select jobid from cron.job where jobname='radar-algora-daily' loop
    perform cron.unschedule(j.jobid);
  end loop;

  select replace(command,'radar-stackoverflow','radar-algora')
    into base_command
  from cron.job
  where jobname='radar-stackoverflow-daily'
  limit 1;

  if base_command is null then
    raise exception 'radar-stackoverflow-daily cron job is required to clone its authenticated Supabase Edge Function invocation';
  end if;

  perform cron.schedule('radar-algora-daily','8 5 * * *',base_command);
end $$;
