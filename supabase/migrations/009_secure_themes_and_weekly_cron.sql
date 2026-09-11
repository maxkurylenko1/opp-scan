-- Lock down V1.3 SECURITY DEFINER RPCs and point the weekly job at hierarchical ranking.

alter function public.theme_tokens(text) set search_path = public, pg_catalog;

revoke execute on function public.refresh_opportunity_themes() from public, anon, authenticated;
revoke execute on function public.radar_theme_rank() from public, anon, authenticated;
revoke execute on function public.radar_refresh_and_rank() from public, anon, authenticated;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname='opportunity-radar-weekly'
  limit 1;

  if v_jobid is not null then
    perform cron.alter_job(v_jobid, command := 'select public.radar_refresh_and_rank();');
  end if;
end;
$$;
