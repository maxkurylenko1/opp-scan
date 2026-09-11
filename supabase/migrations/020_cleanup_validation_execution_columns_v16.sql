update public.experiments
set success_paid_count=coalesce(success_paid_count,success_paid_target,3),
    success_delivered_count=coalesce(success_delivered_count,success_delivered_target,2),
    failure_paid_below_count=coalesce(failure_paid_below_count,failure_max_paid+1,2)
where validation_version is not null;

alter table public.experiments
  drop column if exists success_paid_target,
  drop column if exists success_delivered_target,
  drop column if exists failure_max_paid,
  drop column if exists contacted_count,
  drop column if exists replied_count,
  drop column if exists qualified_count,
  drop column if exists paid_count,
  drop column if exists delivered_count,
  drop column if exists lost_count,
  drop column if exists revenue_amount;
