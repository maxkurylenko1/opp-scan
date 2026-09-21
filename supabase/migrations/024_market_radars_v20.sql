-- V2.0: separate US and Europe opportunity snapshots and market-aware ranking.

alter table public.radar_scan_opportunities
  add column if not exists market text,
  add column if not exists base_opportunity_score numeric(6,2),
  add column if not exists market_fit_score numeric(5,2),
  add column if not exists market_signal_count integer not null default 0,
  add column if not exists market_evidence_count integer not null default 0;

update public.radar_scan_opportunities
set market = coalesce(market, 'us'),
    base_opportunity_score = coalesce(base_opportunity_score, opportunity_score),
    market_fit_score = coalesce(market_fit_score, 5)
where market is null
   or base_opportunity_score is null
   or market_fit_score is null;

alter table public.radar_scan_opportunities
  alter column market set default 'us',
  alter column market set not null,
  alter column base_opportunity_score set not null,
  alter column market_fit_score set not null;

alter table public.radar_scan_opportunities
  drop constraint if exists radar_scan_opportunities_market_check;
alter table public.radar_scan_opportunities
  add constraint radar_scan_opportunities_market_check check (market in ('us','eu'));

alter table public.radar_scan_opportunities
  drop constraint if exists radar_scan_opportunities_scan_id_rank_key;
alter table public.radar_scan_opportunities
  drop constraint if exists radar_scan_opportunities_scan_id_opportunity_id_key;

drop index if exists public.radar_scan_opportunities_scan_rank_idx;
create unique index if not exists radar_scan_opportunities_scan_market_rank_uidx
  on public.radar_scan_opportunities(scan_id,market,rank);
create unique index if not exists radar_scan_opportunities_scan_market_opportunity_uidx
  on public.radar_scan_opportunities(scan_id,market,opportunity_id)
  where opportunity_id is not null;
create index if not exists radar_scan_opportunities_scan_market_idx
  on public.radar_scan_opportunities(scan_id,market,rank);

create or replace function public.radar_signal_market(
  p_source_key text,
  p_currency text,
  p_text text
)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_source_key,'')) = 'freelancer'
      and upper(coalesce(p_currency,'')) = any(array['EUR','GBP','CHF','NOK','SEK','DKK','PLN','CZK','HUF','RON','BGN'])
      then 'eu'
    when lower(coalesce(p_source_key,'')) = 'freelancer'
      and upper(coalesce(p_currency,'')) = 'USD'
      then 'us'
    when lower(coalesce(p_text,'')) like any(array[
      '%europe%','%european union%','% eu %','%united kingdom%','% uk %',
      '%germany%','%france%','%italy%','%spain%','%netherlands%','%belgium%',
      '%austria%','%switzerland%','%norway%','%sweden%','%denmark%','%finland%',
      '%poland%','%czech%','%slovakia%','%romania%','%hungary%','%ireland%'
    ]) then 'eu'
    when lower(coalesce(p_text,'')) like any(array[
      '%united states%','%usa%','%u.s.%','%us-based%','%american business%',
      '%american company%','%california%','%new york%','%texas%','%florida%'
    ]) then 'us'
    else 'global'
  end
$$;

revoke all on function public.radar_signal_market(text,text,text) from public,anon,authenticated;

create or replace function public.radar_snapshot_scan(p_scan_id uuid,p_limit integer default 5)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer;
begin
  delete from public.radar_scan_opportunities where scan_id=p_scan_id;

  with active as (
    select o.*
    from public.opportunities o
    where o.status in ('research','validate','build','winner')
  ),
  opportunity_signals as (
    select distinct
      o.id as opportunity_id,
      s.id as signal_id,
      src.key as source_key,
      coalesce(ri.raw_payload->'currency'->>'code', nullif(s.money_currency,'')) as currency,
      concat_ws(' ',ri.title,ri.body,s.problem,s.workflow,s.industry) as evidence_text
    from active o
    join public.cluster_signals cs
      on o.theme_id is null and cs.cluster_id=o.cluster_id
    join public.signals s on s.id=cs.signal_id
    join public.sources src on src.id=s.source_id
    left join public.raw_items ri on ri.id=s.raw_item_id

    union

    select distinct
      o.id as opportunity_id,
      s.id as signal_id,
      src.key as source_key,
      coalesce(ri.raw_payload->'currency'->>'code', nullif(s.money_currency,'')) as currency,
      concat_ws(' ',ri.title,ri.body,s.problem,s.workflow,s.industry) as evidence_text
    from active o
    join public.theme_clusters tc on tc.theme_id=o.theme_id
    join public.cluster_signals cs on cs.cluster_id=tc.cluster_id
    join public.signals s on s.id=cs.signal_id
    join public.sources src on src.id=s.source_id
    left join public.raw_items ri on ri.id=s.raw_item_id
  ),
  classified as (
    select
      opportunity_id,
      signal_id,
      public.radar_signal_market(source_key,currency,evidence_text) as signal_market
    from opportunity_signals
  ),
  stats as (
    select
      opportunity_id,
      count(distinct signal_id)::integer as evidence_count,
      count(distinct signal_id) filter(where signal_market='us')::integer as us_count,
      count(distinct signal_id) filter(where signal_market='eu')::integer as eu_count,
      count(distinct signal_id) filter(where signal_market='global')::integer as global_count
    from classified
    group by opportunity_id
  ),
  market_candidates as (
    select
      o.*,
      m.market,
      coalesce(st.evidence_count,0) as evidence_count,
      case when m.market='us' then coalesce(st.us_count,0) else coalesce(st.eu_count,0) end as matching_count,
      case when m.market='us' then coalesce(st.eu_count,0) else coalesce(st.us_count,0) end as opposite_count,
      coalesce(st.global_count,0) as global_count
    from active o
    cross join (values ('us'::text),('eu'::text)) m(market)
    left join stats st on st.opportunity_id=o.id
  ),
  market_scored as (
    select
      c.*,
      case
        when matching_count+opposite_count=0 then 5::numeric
        else greatest(0::numeric,least(10::numeric,
          5 + 5 * (matching_count-opposite_count)::numeric / greatest(1,matching_count+opposite_count)
        ))
      end as market_fit
    from market_candidates c
  ),
  ranked as (
    select
      s.*,
      greatest(0::numeric,least(100::numeric,
        s.opportunity_score + (s.market_fit-5) * 1.5
      )) as market_score,
      row_number() over (
        partition by s.market
        order by
          greatest(0::numeric,least(100::numeric,s.opportunity_score + (s.market_fit-5) * 1.5)) desc,
          s.confidence_score desc,
          s.id
      )::integer as market_rank
    from market_scored s
  )
  insert into public.radar_scan_opportunities(
    scan_id,opportunity_id,market,rank,title,origin,status,
    opportunity_score,base_opportunity_score,market_fit_score,
    market_signal_count,market_evidence_count,confidence_score,
    thesis,target_customer,why_now,mvp_scope,biggest_risk,pricing_hypothesis,
    time_to_validation_days,brief
  )
  select
    p_scan_id,
    r.id,
    r.market,
    r.market_rank,
    r.title,
    case when r.theme_id is not null then 'theme' else 'exact' end,
    r.status,
    round(r.market_score,2),
    r.opportunity_score,
    round(r.market_fit,2),
    r.matching_count,
    r.evidence_count,
    r.confidence_score,
    r.thesis,
    r.target_customer,
    r.why_now,
    r.mvp_scope,
    r.biggest_risk,
    r.pricing_hypothesis,
    r.time_to_validation_days,
    case when b.id is null then null else (to_jsonb(b)-'id'-'opportunity_id') end
  from ranked r
  left join public.opportunity_briefs b on b.opportunity_id=r.id
  where r.market_rank <= greatest(1,least(coalesce(p_limit,5),10))
  order by r.market,r.market_rank;

  get diagnostics v_count=row_count;
  update public.radar_scans
  set opportunities_snapshot_count=v_count,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'market_snapshots',jsonb_build_object(
          'us',least(greatest(coalesce(p_limit,5),1),10),
          'eu',least(greatest(coalesce(p_limit,5),1),10),
          'ranking','market-fit-v2.0'
        )
      )
  where id=p_scan_id;

  return v_count;
end
$$;

revoke all on function public.radar_snapshot_scan(uuid,integer) from public,anon,authenticated;


create or replace function public.radar_finalize_scheduled_scan(p_date date default current_date)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_scan_id uuid; v_start timestamptz:=(p_date::timestamp at time zone 'UTC'); v_end timestamptz:=((p_date+1)::timestamp at time zone 'UTC');
  v_runs integer:=0; v_failures integer:=0; v_inserted integer:=0; v_started timestamptz; v_finished timestamptz;
begin
  select id into v_scan_id from public.radar_scans where trigger_type='scheduled' and scan_date=p_date limit 1;
  if v_scan_id is null then
    insert into public.radar_scans(trigger_type,status,scan_date,started_at,metadata)
    values('scheduled','running',p_date,v_start,jsonb_build_object('grouped_from_collection_runs',true)) returning id into v_scan_id;
  end if;
  update public.collection_runs set scan_id=v_scan_id where scan_id is null and started_at>=v_start and started_at<v_end;
  select count(*)::integer,count(*) filter(where status='failed')::integer,coalesce(sum(records_inserted),0)::integer,min(started_at),max(coalesce(finished_at,started_at))
    into v_runs,v_failures,v_inserted,v_started,v_finished from public.collection_runs where scan_id=v_scan_id;
  update public.radar_scans set
    status=case when v_runs=0 then 'failed' when v_failures>0 then 'partial' else 'success' end,
    started_at=coalesce(v_started,started_at),finished_at=coalesce(v_finished,now()),new_raw_items=v_inserted,
    new_signals=(select count(*)::integer from public.signals where created_at>=v_start and created_at<v_end),
    new_actionable=(select count(*)::integer from public.signals where created_at>=v_start and created_at<v_end and is_actionable),
    source_runs=v_runs,source_failures=v_failures
  where id=v_scan_id;
  if p_date=current_date then perform public.radar_snapshot_scan(v_scan_id,5); end if;
  return v_scan_id;
end $$;

revoke all on function public.radar_finalize_scheduled_scan(date) from public,anon,authenticated;
