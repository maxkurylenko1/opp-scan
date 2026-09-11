drop index if exists public.experiments_opportunity_validation_version_uidx;
create unique index if not exists experiments_opportunity_validation_version_uidx
  on public.experiments(opportunity_id, validation_version);
