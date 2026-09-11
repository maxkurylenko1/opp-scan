drop table if exists public.validation_leads cascade;
drop function if exists public.radar_refresh_experiment_execution(uuid);
drop function if exists public.radar_stamp_validation_lead();
drop function if exists public.radar_after_validation_lead();
