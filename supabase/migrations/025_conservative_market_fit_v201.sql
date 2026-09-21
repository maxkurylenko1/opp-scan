-- V2.0.1: make market-fit conservative. USD is global, not automatically US.

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
declare v_count integer;
begin
  delete from public.radar_scan_opportunities where scan_id=p_scan_id;

  with active as (
    select o.* from public.opportunities o
    where o.status in ('research','validate','build','winner')
  ),
  opportunity_signals as (
    select distinct o.id opportunity_id,s.id signal_id,src.key source_key,
      coalesce(ri.raw_payload->'currency'->>'code',nullif(s.money_currency,'')) currency,
      concat_ws(' ',ri.title,ri.body,s.problem,s.workflow,s.industry) evidence_text
    from active o
    join public.cluster_signals cs on o.theme_id is null and cs.cluster_id=o.cluster_id
    join public.signals s on s.id=cs.signal_id
    join public.sources src on src.id=s.source_id
    left join public.raw_items ri on ri.id=s.raw_item_id
    union
    select distinct o.id opportunity_id,s.id signal_id,src.key source_key,
      coalesce(ri.raw_payload->'currency'->>'code',nullif(s.money_currency,'')) currency,
      concat_ws(' ',ri.title,ri.body,s.problem,s.workflow,s.industry) evidence_text
    from active o
    join public.theme_clusters tc on tc.theme_id=o.theme_id
    join public.cluster_signals cs on cs.cluster_id=tc.cluster_id
    join public.signals s on s.id=cs.signal_id
    join public.sources src on src.id=s.source_id
    left join public.raw_items ri on ri.id=s.raw_item_id
  ),
  classified as (
    select opportunity_id,signal_id,public.radar_signal_market(source_key,currency,evidence_text) signal_market
    from opportunity_signals
  ),
  stats as (
    select opportunity_id,
      count(distinct signal_id)::integer evidence_count,
      count(distinct signal_id) filter(where signal_market='us')::integer us_count,
      count(distinct signal_id) filter(where signal_market='eu')::integer eu_count,
      count(distinct signal_id) filter(where signal_market='global')::integer global_count
    from classified group by opportunity_id
  ),
  market_candidates as (
    select o.*,m.market,coalesce(st.evidence_count,0) evidence_count,
      case when m.market='us' then coalesce(st.us_count,0) else coalesce(st.eu_count,0) end matching_count,
      case when m.market='us' then coalesce(st.eu_count,0) else coalesce(st.us_count,0) end opposite_count,
      coalesce(st.global_count,0) global_count
    from active o cross join (values ('us'::text),('eu'::text)) m(market)
    left join stats st on st.opportunity_id=o.id
  ),
  market_scored as (
    select c.*,
      greatest(0::numeric,least(10::numeric,
        5 + least(3,matching_count)::numeric*1.25 - least(2,opposite_count)::numeric*0.75
      )) market_fit
    from market_candidates c
  ),
  ranked as (
    select s.*,
      greatest(0::numeric,least(100::numeric,s.opportunity_score+(s.market_fit-5)*1.5)) market_score,
      row_number() over(
        partition by s.market
        order by greatest(0::numeric,least(100::numeric,s.opportunity_score+(s.market_fit-5)*1.5)) desc,
          s.confidence_score desc,s.id
      )::integer market_rank
    from market_scored s
  )
  insert into public.radar_scan_opportunities(
    scan_id,opportunity_id,market,rank,title,origin,status,opportunity_score,base_opportunity_score,
    market_fit_score,market_signal_count,market_evidence_count,confidence_score,thesis,target_customer,
    why_now,mvp_scope,biggest_risk,pricing_hypothesis,time_to_validation_days,brief
  )
  select p_scan_id,r.id,r.market,r.market_rank,r.title,
    case when r.theme_id is not null then 'theme' else 'exact' end,r.status,
    round(r.market_score,2),r.opportunity_score,round(r.market_fit,2),r.matching_count,r.evidence_count,
    r.confidence_score,r.thesis,r.target_customer,r.why_now,r.mvp_scope,r.biggest_risk,r.pricing_hypothesis,
    r.time_to_validation_days,case when b.id is null then null else (to_jsonb(b)-'id'-'opportunity_id') end
  from ranked r left join public.opportunity_briefs b on b.opportunity_id=r.id
  where r.market_rank<=greatest(1,least(coalesce(p_limit,5),10))
  order by r.market,r.market_rank;

  get diagnostics v_count=row_count;
  update public.radar_scans
  set opportunities_snapshot_count=v_count,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'market_snapshots',jsonb_build_object(
          'us',least(greatest(coalesce(p_limit,5),1),10),
          'eu',least(greatest(coalesce(p_limit,5),1),10),
          'ranking','market-fit-v2.0.1'
        )
      )
  where id=p_scan_id;
  return v_count;
end
$$;

revoke all on function public.radar_snapshot_scan(uuid,integer) from public,anon,authenticated;
