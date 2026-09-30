-- V2.13: source-backed research inbox. This is NOT a ranking or demand model.
-- All automatic matches are only suggestions, never verified independently.

create table if not exists public.research_leads (
  id uuid primary key default gen_random_uuid(),
  anchor_signal_id uuid not null unique references public.signals(id) on delete cascade,
  source_url text not null unique,
  source_key text not null,
  title text not null,
  problem text not null,
  evidence_role text not null check (evidence_role in ('problem_demand','service_spend')),
  origin text not null default 'auto' check (origin in ('auto','curated')),
  status text not null default 'new' check (status in ('new','research','validate','archived')),
  decision_reason text,
  research_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  last_scanned_at timestamptz
);
create index if not exists research_leads_status_recent on public.research_leads(status, created_at desc);
alter table public.research_leads enable row level security;
revoke all on public.research_leads from public,anon,authenticated;
grant select,insert,update,delete on public.research_leads to service_role;

create table if not exists public.research_lead_refs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.research_leads(id) on delete cascade,
  signal_id uuid not null references public.signals(id) on delete cascade,
  source_key text not null,
  source_url text not null,
  title text not null,
  suggestion_type text not null check(suggestion_type in ('related_report','service_spend','potential_competitor','market_context')),
  similarity numeric(5,4) not null check(similarity>=0 and similarity<=1),
  review_status text not null default 'suggested' check(review_status in ('suggested','confirmed','dismissed')),
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (lead_id, signal_id)
);
create index if not exists research_refs_lead on public.research_lead_refs(lead_id,review_status);
alter table public.research_lead_refs enable row level security;
revoke all on public.research_lead_refs from public,anon,authenticated;
grant select,insert,update,delete on public.research_lead_refs to service_role;

create or replace function public.radar_refresh_research_queue(p_limit integer default 15)
returns jsonb
language plpgsql
security invoker
set search_path=public,extensions,pg_catalog
as $research$
declare
  v_curated integer:=0;
  v_new integer:=0;
  v_refs integer:=0;
  v_scanned integer:=0;
  v_slots integer:=0;
  r record;
begin
  if p_limit is null or p_limit<1 or p_limit>30 then
    raise exception 'limit must be between 1 and 30';
  end if;

  -- Backfill the six already manually inspected originals without inventing
  -- citations, independent sources or willingness to pay.
  with wanted(url) as (values
    ('https://news.ycombinator.com/item?id=49879648'),
    ('https://news.ycombinator.com/item?id=49867620'),
    ('https://news.ycombinator.com/item?id=49904074'),
    ('https://news.ycombinator.com/item?id=49839721'),
    ('https://addons.mozilla.org/firefox/addon/multi-account-containers/reviews/'),
    ('https://news.ycombinator.com/item?id=49896742')
  ), anchors as (
    select distinct on (ri.source_url)
      s.id signal_id,ri.source_url,src.key,ri.title,s.problem,s.evidence_role
    from wanted w
    join public.raw_items ri on ri.source_url=w.url
    join public.signals s on s.raw_item_id=ri.id
    join public.sources src on src.id=s.source_id
    where s.is_actionable and s.evidence_role='problem_demand'
    order by ri.source_url,s.evidence_quality_score desc,ri.published_at desc,s.id
  )
  insert into public.research_leads(
    anchor_signal_id,source_url,source_key,title,problem,evidence_role,origin,status
  )
  select signal_id,source_url,key,left(title,240),left(problem,1000),
         evidence_role,'curated','research'
  from anchors
  on conflict do nothing;
  get diagnostics v_curated=row_count;

  -- Bound the inbox: never refill archived leads and never flood >50 new
  -- unattended candidates. Versioned collectors and the normalizer already
  -- apply noise gates; Github-only issues are not standalone seeds.
  select greatest(0,least(p_limit,50-count(*)::integer))
  into v_slots
  from public.research_leads
  where status='new' and origin='auto';

  if v_slots>0 then
    with candidate as (
      select distinct on (ri.source_url)
        s.id signal_id,ri.source_url,src.key,ri.title,s.problem,s.evidence_role,
        ri.published_at, s.pain_score,s.evidence_quality_score
      from public.signals s
      join public.raw_items ri on ri.id=s.raw_item_id
      join public.sources src on src.id=s.source_id
      where s.is_actionable
        and src.enabled
        and ri.source_url like 'https://%'
        and ri.published_at >= now()-interval '60 days'
        and length(coalesce(s.problem,''))>=18
        and length(coalesce(ri.title,''))>=12
        and (
          (
            src.key='hackernews'
            and s.evidence_role='problem_demand'
            and coalesce(s.evidence_quality_score,0)>=6
            and coalesce(s.pain_score,0)>=5
            and length(coalesce(ri.body,''))>=100
            and lower(ri.title) !~ '(what.s stopping a hardwired|hiring questionnaire)'
          )
          or (
            src.key='amo_reviews'
            and s.evidence_role='problem_demand'
            and coalesce(s.pain_score,0)>=5
            and ri.raw_payload->>'review_role'='feature_or_workflow_gap'
          )
          or (
            src.key='freelancer'
            and s.evidence_role='service_spend'
            and ri.raw_payload->>'demand_class'='repeatable_workflow'
            and length(coalesce(ri.body,''))>=100
            and lower(coalesce(ri.title,'')) ~
              '(automati|sync|invoic|recurring|workflow|report|remind|follow.up|integrat|scheduled|batch)'
            and lower(coalesce(ri.title,'')) !~
              '(one.time|pentest|penetration|website redesign|single page)'
          )
        )
        and not exists(
          select 1 from public.research_leads existing
          where existing.source_url=ri.source_url
        )
      order by ri.source_url,
        s.evidence_quality_score desc, s.pain_score desc,
        ri.published_at desc,s.id
    ), ordered as (
      select * from candidate
      order by
        case key when 'hackernews' then 0 when 'amo_reviews' then 1 else 2 end,
        evidence_quality_score desc,pain_score desc,published_at desc
      limit v_slots
    )
    insert into public.research_leads(
      anchor_signal_id,source_url,source_key,title,problem,evidence_role,origin,status
    )
    select signal_id,source_url,key,left(title,240),left(problem,1000),
           evidence_role,'auto','new'
    from ordered
    on conflict do nothing;
    get diagnostics v_new=row_count;
  end if;

  -- Suggestions only: two lexical subject tokens, same category, high vector
  -- similarity and distinct URLs. Same author cannot self-corroborate even
  -- across multiple sites; different authors must still be manually verified.
  -- No extra API/scraping calls and no new rankings or money labels.
  for r in
    select rl.id,rl.anchor_signal_id,rl.source_url,
           s.embedding,s.category,s.problem,s.source_id,
           ri.author anchor_author
    from public.research_leads rl
    join public.signals s on s.id=rl.anchor_signal_id
    join public.raw_items ri on ri.id=s.raw_item_id
    where rl.status in ('new','research','validate')
      and s.is_actionable
      and s.embedding is not null
    order by rl.last_scanned_at nulls first,rl.created_at desc
    limit 60
  loop
    v_scanned:=v_scanned+1;

    with matching as (
      select
        s2.id signal_id,src2.key,ri2.source_url,ri2.title,s2.evidence_role,
        (1-(s2.embedding <=> r.embedding))::numeric similarity,
        case
          when s2.evidence_role='service_spend' then 'service_spend'
          when s2.evidence_role='launch_competitor' then 'potential_competitor'
          when s2.evidence_role='market_context' then 'market_context'
          else 'related_report'
        end suggestion_type
      from public.signals s2
      join public.raw_items ri2 on ri2.id=s2.raw_item_id
      join public.sources src2 on src2.id=s2.source_id
      where s2.id<>r.anchor_signal_id
        and src2.enabled and src2.key<>'reddit'
        and ri2.source_url like 'https://%'
        and ri2.source_url<>r.source_url
        and s2.embedding is not null
        and s2.category=r.category
        and not (
          r.anchor_author is not null and ri2.author is not null
          and length(trim(r.anchor_author))>0
          and lower(trim(r.anchor_author))=lower(trim(ri2.author))
        )
        and (
          (s2.is_actionable and s2.evidence_role in ('problem_demand','service_spend'))
          or (s2.evidence_role='launch_competitor' and src2.key='hackernews')
          or (s2.evidence_role='market_context' and src2.kind='changelog')
        )
        and (1-(s2.embedding <=> r.embedding)) >=
          case when s2.evidence_role in ('market_context','launch_competitor') then 0.88 else 0.84 end
        and (
          select count(*)
          from (
            select unnest(public.theme_tokens(r.problem))
            intersect
            select unnest(public.theme_tokens(s2.problem))
          ) shared
        )>=2
      order by s2.embedding <=> r.embedding,s2.id
      limit 4
    )
    insert into public.research_lead_refs(
      lead_id,signal_id,source_key,source_url,title,suggestion_type,similarity
    )
    select r.id,signal_id,key,source_url,left(title,240),
           suggestion_type,least(1,greatest(0,similarity))
    from matching
    on conflict (lead_id,signal_id) do nothing;
    get diagnostics v_slots=row_count;
    v_refs:=v_refs+v_slots;

    update public.research_leads
    set last_scanned_at=now()
    where id=r.id;
  end loop;

  -- Never keep an automatically suggested source that lost its evidence gate.
  -- Human-confirmed references remain visible for review and must be
  -- explicitly reconsidered if the underlying source later changes.
  delete from public.research_lead_refs rr
  using public.signals s
  where rr.signal_id=s.id
    and rr.review_status='suggested'
    and rr.suggestion_type in ('related_report','service_spend')
    and (not s.is_actionable or s.evidence_role not in ('problem_demand','service_spend'));

  return jsonb_build_object(
    'curated_seeded',v_curated,
    'new_candidates',v_new,
    'new_match_suggestions',v_refs,
    'anchors_scanned',v_scanned,
    'review_required',true
  );
end;
$research$;

revoke all on function public.radar_refresh_research_queue(integer) from public,anon,authenticated;
grant execute on function public.radar_refresh_research_queue(integer) to service_role;

select cron.schedule(
  'radar-research-queue-daily',
  '5 6 * * *',
  'select public.radar_refresh_research_queue(15);'
);
