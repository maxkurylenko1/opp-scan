create or replace function public.refresh_opportunity_themes()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count integer := 0;
begin
  create temporary table if not exists tmp_theme_edges (a uuid,b uuid,similarity numeric) on commit drop;
  truncate tmp_theme_edges;

  insert into tmp_theme_edges(a,b,similarity)
  with cp as (
    select pc.id,pc.name,pc.category,pc.embedding,array_agg(distinct src.kind order by src.kind) as platforms
    from public.problem_clusters pc
    join public.cluster_signals cs on cs.cluster_id=pc.id and cs.assignment_method='semantic-v1.1'
    join public.signals s on s.id=cs.signal_id
    join public.sources src on src.id=s.source_id
    where pc.clustering_version='semantic-v1.1' and pc.embedding is not null and pc.status<>'killed'
    group by pc.id,pc.name,pc.category,pc.embedding
  ), pairs as (
    select a.id a,b.id b,a.name a_name,b.name b_name,a.category,a.platforms a_platforms,b.platforms b_platforms,
           (1-(a.embedding <=> b.embedding))::numeric as sim
    from cp a join cp b on a.id < b.id and a.category=b.category
  )
  select a,b,sim from pairs
  where sim>=0.90
     or (sim>=0.76 and public.theme_tokens(a_name) && public.theme_tokens(b_name))
     or (not (a_platforms && b_platforms) and sim>=0.64 and public.theme_tokens(a_name) && public.theme_tokens(b_name));

  create temporary table if not exists tmp_theme_components (cluster_id uuid,root_id uuid) on commit drop;
  truncate tmp_theme_components;
  insert into tmp_theme_components(cluster_id,root_id)
  with recursive vertices as (
    select a id from tmp_theme_edges union select b id from tmp_theme_edges
  ), reach(start_id,node_id) as (
    select id,id from vertices
    union
    select r.start_id,case when e.a=r.node_id then e.b else e.a end
    from reach r join tmp_theme_edges e on e.a=r.node_id or e.b=r.node_id
  )
  select node_id,min(start_id::text)::uuid from reach group by node_id;

  create temporary table if not exists tmp_theme_defs (
    slug text primary key,name text,summary text,category text,embedding extensions.vector(1536),
    first_seen_at timestamptz,last_seen_at timestamptz,root_id uuid
  ) on commit drop;
  truncate tmp_theme_defs;

  insert into tmp_theme_defs(slug,name,summary,category,embedding,first_seen_at,last_seen_at,root_id)
  with component_stats as (
    select tc.root_id,count(*) cluster_count,min(pc.first_seen_at) first_seen_at,max(pc.last_seen_at) last_seen_at
    from tmp_theme_components tc join public.problem_clusters pc on pc.id=tc.cluster_id
    group by tc.root_id having count(*)>=2
  ), anchor as (
    select distinct on (tc.root_id) tc.root_id,pc.name,pc.summary,pc.category,pc.embedding,
           coalesce(cm.signal_count,0) signal_count,coalesce(cm.money_signal_count,0) money_signal_count
    from tmp_theme_components tc
    join component_stats st on st.root_id=tc.root_id
    join public.problem_clusters pc on pc.id=tc.cluster_id
    left join lateral (
      select count(distinct s.id)::int signal_count,
             count(distinct s.id) filter(where s.money_signal_type is not null and s.money_signal_type<>'none')::int money_signal_count
      from public.cluster_signals cs join public.signals s on s.id=cs.signal_id
      where cs.cluster_id=pc.id and cs.assignment_method='semantic-v1.1'
    ) cm on true
    order by tc.root_id,(coalesce(cm.money_signal_count,0)*3+coalesce(cm.signal_count,0)) desc,pc.name
  )
  select 'theme-'||st.root_id::text,a.name,format('Repeated opportunity theme spanning %s exact problem clusters.',st.cluster_count),
         a.category,a.embedding,st.first_seen_at,st.last_seen_at,st.root_id
  from component_stats st join anchor a on a.root_id=st.root_id;

  insert into public.opportunity_themes(slug,name,summary,category,status,embedding,theme_version,first_seen_at,last_seen_at,updated_at)
  select slug,name,summary,category,'watching',embedding,'theme-v1.0',first_seen_at,last_seen_at,now() from tmp_theme_defs
  on conflict(slug) do update set
    name=excluded.name,summary=excluded.summary,category=excluded.category,embedding=excluded.embedding,theme_version='theme-v1.0',
    first_seen_at=least(coalesce(public.opportunity_themes.first_seen_at,excluded.first_seen_at),excluded.first_seen_at),
    last_seen_at=greatest(coalesce(public.opportunity_themes.last_seen_at,excluded.last_seen_at),excluded.last_seen_at),
    status=case when public.opportunity_themes.status='killed' then 'killed' else 'watching' end,updated_at=now();

  update public.opportunity_themes ot set status='killed',updated_at=now()
  where ot.theme_version='theme-v1.0' and not exists(select 1 from tmp_theme_defs d where d.slug=ot.slug);

  delete from public.theme_clusters tc using public.opportunity_themes ot
  where tc.theme_id=ot.id and ot.theme_version='theme-v1.0';
  delete from public.theme_metrics tm using public.opportunity_themes ot
  where tm.theme_id=ot.id and ot.theme_version='theme-v1.0';

  insert into public.theme_clusters(theme_id,cluster_id,similarity,assignment_method)
  select ot.id,tc.cluster_id,greatest(0,least(1,(1-(pc.embedding <=> ot.embedding))::numeric)),'theme-v1.0'
  from tmp_theme_components tc
  join tmp_theme_defs d on d.root_id=tc.root_id
  join public.opportunity_themes ot on ot.slug=d.slug and ot.theme_version='theme-v1.0'
  join public.problem_clusters pc on pc.id=tc.cluster_id;

  insert into public.theme_metrics(theme_id,exact_cluster_count,signal_count,independent_source_count,money_signal_count,
    unique_author_count,avg_pain,avg_purchase_intent,avg_evidence_quality,recent_signal_count,updated_at)
  select ot.id,count(distinct tc.cluster_id)::int,count(distinct s.id)::int,count(distinct src.kind)::int,
    count(distinct s.id) filter(where s.money_signal_type is not null and s.money_signal_type<>'none')::int,
    count(distinct nullif(ri.author,''))::int,coalesce(avg(s.pain_score),0),coalesce(avg(s.purchase_intent_score),0),
    coalesce(avg(s.evidence_quality_score),0),count(distinct s.id) filter(where s.published_at>=now()-interval '7 days')::int,now()
  from public.opportunity_themes ot
  join public.theme_clusters tc on tc.theme_id=ot.id and tc.assignment_method='theme-v1.0'
  join public.cluster_signals cs on cs.cluster_id=tc.cluster_id and cs.assignment_method='semantic-v1.1'
  join public.signals s on s.id=cs.signal_id
  join public.sources src on src.id=s.source_id
  left join public.raw_items ri on ri.id=s.raw_item_id
  where ot.theme_version='theme-v1.0' and ot.status<>'killed'
  group by ot.id;

  update public.opportunities o set status='watching',updated_at=now()
  where o.theme_id in (select id from public.opportunity_themes where theme_version='theme-v1.0' and status='killed')
    and o.status in ('research','validate');

  select count(*) into v_count from public.opportunity_themes where theme_version='theme-v1.0' and status<>'killed';
  return v_count;
end;
$$;

revoke execute on function public.refresh_opportunity_themes() from public,anon,authenticated;
