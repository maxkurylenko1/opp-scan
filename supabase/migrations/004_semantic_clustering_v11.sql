create extension if not exists vector with schema extensions;

alter table public.signals
  add column if not exists embedding extensions.vector(1536),
  add column if not exists embedding_model text,
  add column if not exists embedding_updated_at timestamptz;

alter table public.problem_clusters
  add column if not exists embedding extensions.vector(1536),
  add column if not exists clustering_version text not null default 'heuristic-v1';

create index if not exists signals_embedding_hnsw_idx
  on public.signals using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists problem_clusters_embedding_hnsw_idx
  on public.problem_clusters using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists problem_clusters_version_idx
  on public.problem_clusters(clustering_version, last_seen_at desc);

create index if not exists cluster_signals_assignment_idx
  on public.cluster_signals(assignment_method, cluster_id);

create or replace function public.match_problem_clusters(
  query_embedding extensions.vector(1536),
  match_threshold double precision default 0.78,
  match_count integer default 8,
  version_filter text default 'semantic-v1.1'
)
returns table (
  id uuid,
  slug text,
  name text,
  category text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select pc.id, pc.slug, pc.name, pc.category,
    1 - (pc.embedding <=> query_embedding) as similarity
  from public.problem_clusters pc
  where pc.embedding is not null
    and pc.clustering_version = version_filter
    and 1 - (pc.embedding <=> query_embedding) >= match_threshold
  order by pc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

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
    pc.id, metric_day, 7,
    count(distinct s.id)::int,
    count(distinct s.source_id)::int,
    count(distinct s.id) filter (where s.money_signal_type <> 'none')::int,
    count(distinct nullif(ri.author, ''))::int,
    coalesce(avg(s.pain_score), 0)::numeric(5,2),
    coalesce(avg(s.purchase_intent_score), 0)::numeric(5,2),
    coalesce(sum((s.pain_score * 0.35) + (s.purchase_intent_score * 0.30) +
      (s.evidence_quality_score * 0.20) + (s.urgency_score * 0.15)), 0)::numeric(7,3),
    case when prev.signal_count is null or prev.signal_count = 0 then null
      else round(((count(distinct s.id)::numeric - prev.signal_count) / prev.signal_count) * 100, 2)
    end
  from public.problem_clusters pc
  join public.cluster_signals cs on cs.cluster_id = pc.id and cs.assignment_method = 'semantic-v1.1'
  join public.signals s on s.id = cs.signal_id
  left join public.raw_items ri on ri.id = s.raw_item_id
  left join lateral (
    select cm.signal_count from public.cluster_metrics cm
    where cm.cluster_id = pc.id and cm.metric_date < metric_day and cm.window_days = 7
    order by cm.metric_date desc limit 1
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
