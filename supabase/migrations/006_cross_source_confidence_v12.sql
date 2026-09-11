-- V1.2: cross-source confidence and semantic ranking.
-- Applied to production on 2026-09-11.

create or replace function public.refresh_semantic_cluster_metrics(metric_day date default current_date)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  affected integer;
begin
  insert into public.cluster_metrics (
    cluster_id, metric_date, window_days, signal_count, independent_source_count,
    money_signal_count, unique_author_count, avg_pain, avg_purchase_intent,
    weighted_signal_strength, growth_pct
  )
  select
    pc.id,
    metric_day,
    7,
    count(distinct s.id)::int,
    count(distinct src.kind)::int,
    count(distinct s.id) filter (where s.money_signal_type <> 'none')::int,
    count(distinct nullif(ri.author, ''))::int,
    coalesce(avg(s.pain_score), 0)::numeric(5,2),
    coalesce(avg(s.purchase_intent_score), 0)::numeric(5,2),
    coalesce(sum((s.pain_score * 0.35) + (s.purchase_intent_score * 0.30) + (s.evidence_quality_score * 0.20) + (s.urgency_score * 0.15)), 0)::numeric(7,3),
    case when prev.signal_count is null or prev.signal_count = 0 then null
      else round(((count(distinct s.id)::numeric - prev.signal_count) / prev.signal_count) * 100, 2)
    end
  from public.problem_clusters pc
  join public.cluster_signals cs on cs.cluster_id = pc.id and cs.assignment_method = 'semantic-v1.1'
  join public.signals s on s.id = cs.signal_id
  join public.sources src on src.id = s.source_id
  left join public.raw_items ri on ri.id = s.raw_item_id
  left join lateral (
    select cm.signal_count
    from public.cluster_metrics cm
    where cm.cluster_id = pc.id and cm.metric_date < metric_day and cm.window_days = 7
    order by cm.metric_date desc
    limit 1
  ) prev on true
  where pc.clustering_version = 'semantic-v1.1'
    and s.published_at >= (metric_day::timestamptz - interval '7 days')
    and s.published_at < ((metric_day + 1)::timestamptz)
  group by pc.id, prev.signal_count
  on conflict (cluster_id, metric_date, window_days)
  do update set
    signal_count = excluded.signal_count,
    independent_source_count = excluded.independent_source_count,
    money_signal_count = excluded.money_signal_count,
    unique_author_count = excluded.unique_author_count,
    avg_pain = excluded.avg_pain,
    avg_purchase_intent = excluded.avg_purchase_intent,
    weighted_signal_strength = excluded.weighted_signal_strength,
    growth_pct = excluded.growth_pct;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- The production radar_weekly_rank() uses semantic-v1.1 when available and
-- counts independent evidence by sources.kind (platform), not source_id.
-- Confidence weights in V1.2: platform coverage 35%, money evidence 25%,
-- evidence quality 20%, recency 20%. Validation requires score >= 75,
-- confidence >= 55 and either >=2 platforms or >=2 money signals.

revoke all on function public.refresh_semantic_cluster_metrics(date) from public, anon, authenticated;
revoke all on function public.radar_weekly_rank() from public, anon, authenticated;
