-- Opportunity Radar V1.3
-- Hierarchical layer: exact semantic problem clusters -> conservative opportunity themes.

create table if not exists public.opportunity_themes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  summary text,
  category text,
  status text not null default 'watching' check (status in ('watching','research','validate','build','killed','winner')),
  embedding vector(1536),
  theme_version text not null default 'theme-v1.0',
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.theme_clusters (
  theme_id uuid not null references public.opportunity_themes(id) on delete cascade,
  cluster_id uuid not null references public.problem_clusters(id) on delete cascade,
  similarity numeric not null default 1,
  assignment_method text not null default 'theme-v1.0',
  created_at timestamptz not null default now(),
  primary key(theme_id,cluster_id)
);
create index if not exists theme_clusters_cluster_id_idx on public.theme_clusters(cluster_id);

create table if not exists public.theme_metrics (
  theme_id uuid primary key references public.opportunity_themes(id) on delete cascade,
  exact_cluster_count integer not null default 0,
  signal_count integer not null default 0,
  independent_source_count integer not null default 0,
  money_signal_count integer not null default 0,
  unique_author_count integer not null default 0,
  avg_pain numeric not null default 0,
  avg_purchase_intent numeric not null default 0,
  avg_evidence_quality numeric not null default 0,
  recent_signal_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.opportunities add column if not exists theme_id uuid references public.opportunity_themes(id) on delete cascade;
alter table public.opportunities alter column cluster_id drop not null;
create unique index if not exists opportunities_theme_id_key on public.opportunities(theme_id) where theme_id is not null;
alter table public.opportunities drop constraint if exists opportunities_origin_check;
alter table public.opportunities add constraint opportunities_origin_check check (
  (cluster_id is not null and theme_id is null) or (cluster_id is null and theme_id is not null)
);

alter table public.opportunity_themes enable row level security;
alter table public.theme_clusters enable row level security;
alter table public.theme_metrics enable row level security;

create or replace function public.theme_tokens(p_text text)
returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct tok order by tok), '{}'::text[])
  from unnest(regexp_split_to_array(lower(regexp_replace(coalesce(p_text,''), '[^a-z0-9а-яё]+', ' ', 'gi')), '\s+')) tok
  where length(tok) >= 4
    and tok <> all(array[
      'this','that','with','from','into','using','need','needed','looking','feature','request','tool','tools',
      'developer','development','project','partner','expert','engineer','senior','website','build','fix','bugs','fullstack',
      'work','solution','software','support','update','system','client','service','data','workflow','manual','issue','issues',
      'implementation','comprehensive','experienced','finalize','stabilize'
    ]::text[]);
$$;

create or replace function public.refresh_opportunity_themes()
returns integer
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_count integer := 0;
begin
  delete from public.opportunity_themes where theme_version='theme-v1.0';

  create temporary table if not exists tmp_theme_edges(a uuid,b uuid,similarity numeric) on commit drop;
  truncate tmp_theme_edges;

  insert into tmp_theme_edges(a,b,similarity)
  with cp as (
    select pc.id,pc.name,pc.category,pc.embedding,
           array_agg(distinct src.kind order by src.kind) as platforms
    from public.problem_clusters pc
    join public.cluster_signals cs on cs.cluster_id=pc.id and cs.assignment_method='semantic-v1.1'
    join public.signals s on s.id=cs.signal_id
    join public.sources src on src.id=s.source_id
    where pc.clustering_version='semantic-v1.1'
      and pc.embedding is not null
      and pc.status<>'killed'
    group by pc.id,pc.name,pc.category,pc.embedding
  ), pairs as (
    select a.id a,b.id b,a.name a_name,b.name b_name,a.category,
           a.platforms a_platforms,b.platforms b_platforms,
           (1-(a.embedding <=> b.embedding))::numeric as sim
    from cp a join cp b on a.id<b.id and a.category=b.category
  )
  select a,b,sim from pairs
  where sim>=0.90
     or (sim>=0.76 and public.theme_tokens(a_name) && public.theme_tokens(b_name))
     or (not (a_platforms && b_platforms) and sim>=0.64 and public.theme_tokens(a_name) && public.theme_tokens(b_name));

  create temporary table if not exists tmp_theme_components(cluster_id uuid,root_id uuid) on commit drop;
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

  insert into public.opportunity_themes(slug,name,summary,category,status,embedding,theme_version,first_seen_at,last_seen_at)
  with component_stats as (
    select tc.root_id,count(*) cluster_count,min(pc.first_seen_at) first_seen_at,max(pc.last_seen_at) last_seen_at
    from tmp_theme_components tc join public.problem_clusters pc on pc.id=tc.cluster_id
    group by tc.root_id having count(*)>=2
  ), anchor as (
    select distinct on(tc.root_id)
      tc.root_id,pc.id,pc.name,pc.summary,pc.category,pc.embedding,
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
  select 'theme-'||st.root_id::text,a.name,
         format('Repeated opportunity theme spanning %s exact problem clusters.',st.cluster_count),
         a.category,'watching',a.embedding,'theme-v1.0',st.first_seen_at,st.last_seen_at
  from component_stats st join anchor a on a.root_id=st.root_id;

  insert into public.theme_clusters(theme_id,cluster_id,similarity,assignment_method)
  select ot.id,tc.cluster_id,greatest(0,least(1,(1-(pc.embedding <=> ot.embedding))::numeric)),'theme-v1.0'
  from tmp_theme_components tc
  join public.opportunity_themes ot on ot.slug='theme-'||tc.root_id::text and ot.theme_version='theme-v1.0'
  join public.problem_clusters pc on pc.id=tc.cluster_id;

  insert into public.theme_metrics(
    theme_id,exact_cluster_count,signal_count,independent_source_count,money_signal_count,
    unique_author_count,avg_pain,avg_purchase_intent,avg_evidence_quality,recent_signal_count,updated_at
  )
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
  where ot.theme_version='theme-v1.0'
  group by ot.id
  on conflict(theme_id) do update set
    exact_cluster_count=excluded.exact_cluster_count,signal_count=excluded.signal_count,
    independent_source_count=excluded.independent_source_count,money_signal_count=excluded.money_signal_count,
    unique_author_count=excluded.unique_author_count,avg_pain=excluded.avg_pain,
    avg_purchase_intent=excluded.avg_purchase_intent,avg_evidence_quality=excluded.avg_evidence_quality,
    recent_signal_count=excluded.recent_signal_count,updated_at=now();

  select count(*) into v_count from public.opportunity_themes where theme_version='theme-v1.0';
  return v_count;
end;
$$;

-- radar_theme_rank() ranks only themes with 2+ exact clusters and either
-- 2+ independent platforms or 2+ direct money signals.
-- Production definition is installed by this migration series.

create or replace function public.radar_refresh_and_rank()
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_themes integer:=0;
  v_ranked integer:=0;
  v_mode text;
begin
  v_themes:=public.refresh_opportunity_themes();
  v_ranked:=public.radar_theme_rank();
  if v_ranked>0 then
    v_mode:='theme-v1.0';
  else
    v_ranked:=public.radar_weekly_rank();
    v_mode:='cross-source-v1.2.1';
  end if;
  return jsonb_build_object('themes',v_themes,'ranked',v_ranked,'mode',v_mode);
end;
$$;

revoke all on function public.refresh_opportunity_themes() from public;
revoke all on function public.radar_refresh_and_rank() from public;
