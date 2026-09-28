-- V2.1: calibrate evidence confidence and separate problem proof from product proof.
-- Early ideas stay visible as "scout"; validation requires stronger, product-specific evidence.

alter table public.theme_metrics
  add column if not exists independent_source_key_count integer not null default 0,
  add column if not exists evidence_unit_count integer not null default 0,
  add column if not exists organic_problem_signal_count integer not null default 0,
  add column if not exists service_spend_signal_count integer not null default 0,
  add column if not exists direct_product_purchase_signal_count integer not null default 0,
  add column if not exists self_promo_signal_count integer not null default 0,
  add column if not exists recent_evidence_unit_count integer not null default 0;

alter table public.opportunity_themes
  add column if not exists market_product_demand_score numeric(4,2),
  add column if not exists market_saturation_score numeric(4,2),
  add column if not exists market_incumbent_risk_score numeric(4,2),
  add column if not exists market_timing_score numeric(4,2),
  add column if not exists market_regulatory_capital_risk_score numeric(4,2),
  add column if not exists market_counter_evidence_count integer not null default 0,
  add column if not exists market_direct_purchase_evidence_count integer not null default 0,
  add column if not exists market_service_spend_evidence_count integer not null default 0,
  add column if not exists market_independent_demand_source_count integer not null default 0;

alter table public.evidence
  add column if not exists evidence_role text,
  add column if not exists is_self_promo boolean not null default false,
  add column if not exists independence_key text;

alter table public.opportunities
  add column if not exists problem_confidence_score numeric(5,2) not null default 0,
  add column if not exists product_confidence_score numeric(5,2) not null default 0,
  add column if not exists decision_tier text not null default 'scout';

alter table public.opportunities drop constraint if exists opportunities_decision_tier_check;
alter table public.opportunities add constraint opportunities_decision_tier_check
  check (decision_tier in ('scout','research','validate','build'));

alter table public.radar_scan_opportunities
  add column if not exists problem_confidence_score numeric(5,2) not null default 0,
  add column if not exists product_confidence_score numeric(5,2) not null default 0,
  add column if not exists decision_tier text not null default 'scout';

create or replace function public.radar_refresh_evidence_metrics()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer := 0;
begin
  with classified as (
    select
      ot.id as theme_id,
      s.id as signal_id,
      s.published_at,
      s.evidence_quality_score,
      src.key as source_key,
      src.kind as source_kind,
      nullif(ri.author,'') as author,
      ri.id as raw_item_id,
      lower(concat_ws(' ',ri.title,ri.body,s.problem,s.evidence_excerpt)) as txt,
      case
        when src.kind <> 'marketplace'
         and lower(concat_ws(' ',ri.title,ri.body,s.problem)) ~
           '(\bi built\b|\bi made\b|\bwe built\b|\bwe made\b|\bwe launched\b|\blaunching my\b|\bmy saas\b|\bmy app\b|\bshow hn\b|\bintroducing our\b)'
        then true else false
      end as self_promo,
      case
        when src.kind = 'marketplace' then true
        when s.money_signal_type in ('job_post','bounty') then true
        else false
      end as service_spend,
      case
        when src.kind <> 'marketplace'
         and lower(concat_ws(' ',ri.title,ri.body,s.problem,s.evidence_excerpt)) ~
           '(would pay|willing to pay|pay for (a|an|this|something)|looking for (a|an|some) (tool|app|service|alternative)|need (a|an) (tool|app|service)|any (tool|app|service).*(for|that)|subscription.*(need|worth|looking))'
         and not (
           lower(concat_ws(' ',ri.title,ri.body,s.problem)) ~
           '(\bi built\b|\bi made\b|\bwe built\b|\bwe launched\b|\bmy saas\b|\bmy app\b|\bshow hn\b)'
         )
        then true else false
      end as direct_product_purchase
    from public.opportunity_themes ot
    join public.theme_clusters tc on tc.theme_id=ot.id and tc.assignment_method='theme-v1.0'
    join public.cluster_signals cs on cs.cluster_id=tc.cluster_id and cs.assignment_method='semantic-v1.1'
    join public.signals s on s.id=cs.signal_id
    join public.sources src on src.id=s.source_id
    left join public.raw_items ri on ri.id=s.raw_item_id
    where ot.theme_version='theme-v1.0' and ot.status<>'killed'
  ), agg as (
    select
      theme_id,
      count(distinct source_key)::int as source_keys,
      count(distinct coalesce(raw_item_id::text,signal_id::text))::int as evidence_units,
      count(distinct signal_id) filter(where source_kind<>'marketplace' and not self_promo)::int as organic_problem,
      count(distinct signal_id) filter(where service_spend)::int as service_spend,
      count(distinct signal_id) filter(where direct_product_purchase)::int as direct_purchase,
      count(distinct signal_id) filter(where self_promo)::int as self_promo,
      count(distinct coalesce(raw_item_id::text,signal_id::text))
        filter(where published_at>=now()-interval '7 days')::int as recent_units
    from classified
    group by theme_id
  )
  update public.theme_metrics tm
  set independent_source_key_count=coalesce(a.source_keys,0),
      evidence_unit_count=coalesce(a.evidence_units,0),
      organic_problem_signal_count=coalesce(a.organic_problem,0),
      service_spend_signal_count=coalesce(a.service_spend,0),
      direct_product_purchase_signal_count=coalesce(a.direct_purchase,0),
      self_promo_signal_count=coalesce(a.self_promo,0),
      recent_evidence_unit_count=coalesce(a.recent_units,0),
      updated_at=now()
  from agg a
  where tm.theme_id=a.theme_id;

  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke execute on function public.radar_refresh_evidence_metrics() from public,anon,authenticated;

create or replace function public.radar_theme_rank()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  r record;
  v_opp_id uuid;
  v_count integer := 0;
  v_top uuid[] := '{}';
  v_watch uuid[] := '{}';
  v_week_start date := (current_date - ((extract(isodow from current_date)::int)-1));
  v_week_end date := v_week_start + 6;
begin
  update public.opportunities set status='watching',updated_at=now()
  where theme_id is not null and status in ('research','validate');

  for r in
    with base as (
      select
        ot.*,tm.*,
        (ot.market_researched_at is not null and ot.market_research_version='web-v2.1') as current_research,
        least(10,greatest(0,ln(greatest(tm.evidence_unit_count,1)+1)/ln(2)*2.6))::numeric as freq,
        least(10,greatest(0,tm.recent_evidence_unit_count::numeric/greatest(tm.evidence_unit_count,1)*10))::numeric as recency,
        case when ot.category in ('developer-tool','browser-extension') then 8 else 6 end::numeric as preliminary_reach,
        case
          when ob.build_days_max is null then case when ot.category in ('developer-tool','browser-extension','automation','ai-tooling') then 8 else 6 end::numeric
          when ob.build_days_max<=7 then 9::numeric
          when ob.build_days_max<=14 then 8::numeric
          when ob.build_days_max<=21 then 5::numeric
          else 2::numeric
        end as buildability,
        case when ot.category in ('developer-tool','automation','ai-tooling','ecommerce') then 7 else 5 end::numeric as recurring,
        coalesce(case when ot.market_research_version='web-v2.1' then ot.market_gap_score end,5)::numeric as gap,
        coalesce(case when ot.market_research_version='web-v2.1' then ot.market_timing_score end,
                 least(10,greatest(0,tm.recent_evidence_unit_count::numeric/greatest(tm.evidence_unit_count,1)*10)))::numeric as timing,
        coalesce(case when ot.market_research_version='web-v2.1' then ot.market_regulatory_capital_risk_score end,0)::numeric as regulatory_risk
      from public.opportunity_themes ot
      join public.theme_metrics tm on tm.theme_id=ot.id
      left join public.opportunities ox on ox.theme_id=ot.id
      left join public.opportunity_briefs ob on ob.opportunity_id=ox.id
      where ot.theme_version='theme-v1.0'
        and ot.status<>'killed'
        and tm.exact_cluster_count>=2
        and (
          tm.independent_source_key_count>=2
          or tm.service_spend_signal_count>=2
          or tm.evidence_unit_count>=3
        )
    ), confidence_parts as (
      select *,
        greatest(0,least(100,
          (least(independent_source_key_count,4)::numeric/4*25) +
          (least(evidence_unit_count,6)::numeric/6*20) +
          (least(unique_author_count + least(service_spend_signal_count,2),5)::numeric/5*15) +
          (avg_evidence_quality/10*20) +
          (least(recent_evidence_unit_count,4)::numeric/4*20) -
          least(20,self_promo_signal_count::numeric/greatest(evidence_unit_count,1)*35)
        )) as problem_conf,
        greatest(0,
          (least(direct_product_purchase_signal_count,3)::numeric/3*20) +
          (least(service_spend_signal_count,4)::numeric/4*10) +
          (case when current_research then coalesce(market_product_demand_score,0)/10*25 else 0 end) +
          (case when current_research then least(market_independent_demand_source_count,4)::numeric/4*15 else 0 end) +
          (case when current_research then 10 else 0 end) +
          (case when current_research then coalesce(market_gap_score,5)/10*10 else 0 end) -
          (case when current_research then least(market_counter_evidence_count,3)*4 else 0 end) -
          (case when current_research then coalesce(market_saturation_score,0)*0.7 else 0 end) -
          (case when current_research then coalesce(market_incumbent_risk_score,0)*0.7 else 0 end)
        ) as product_conf_raw,
        least(10,
          least(service_spend_signal_count,4)::numeric*1.0 +
          least(direct_product_purchase_signal_count,3)::numeric*1.5 +
          case when current_research then least(market_direct_purchase_evidence_count,2)::numeric*0.75 else 0 end
        ) as calibrated_wtp
      from base
    ), confidence as (
      select *,
        least(100,
          case
            when not current_research then least(product_conf_raw,40)
            when direct_product_purchase_signal_count=0
             and market_direct_purchase_evidence_count=0
             and coalesce(market_product_demand_score,0)<6 then least(product_conf_raw,55)
            else product_conf_raw
          end
        ) as product_conf
      from confidence_parts
    ), scored as (
      select *,
        greatest(0,least(100,
          round((
            avg_pain*20 + calibrated_wtp*20 + preliminary_reach*15 + freq*10 +
            timing*10 + gap*10 + buildability*10 + recurring*5
          )/10 - least(8,regulatory_risk*0.8),2)
        )) as score
      from confidence
    ), decided as (
      select *,
        round((problem_conf*0.55 + product_conf*0.45),2) as overall_conf,
        case
          when score>=65 and problem_conf>=65 and product_conf>=50 and current_research then 'validate'
          when score>=48 and problem_conf>=48 then 'research'
          else 'scout'
        end as decision
      from scored
    )
    select *
    from decided
    order by
      case decision when 'validate' then 3 when 'research' then 2 else 1 end desc,
      (score*(0.50+0.30*problem_conf/100+0.20*product_conf/100)) desc
    limit 12
  loop
    insert into public.opportunities(
      cluster_id,theme_id,title,thesis,target_customer,pain_summary,why_now,mvp_scope,
      acquisition_channel,pricing_hypothesis,time_to_validation_days,time_to_money_days,status,
      opportunity_score,confidence_score,problem_confidence_score,product_confidence_score,decision_tier,
      biggest_risk,validation_experiment,score_version,generated_at,updated_at
    ) values (
      null,r.id,r.name,
      format('Observed problem pattern: %s evidence unit(s) across %s source(s); %s service-spend signal(s), %s direct product-intent signal(s).',
        r.evidence_unit_count,r.independent_source_key_count,r.service_spend_signal_count,r.direct_product_purchase_signal_count),
      null,r.summary,
      format('Problem confidence %s%%; product confidence %s%%; %s.',
        round(r.problem_conf,0),round(r.product_conf,0),
        case when r.current_research then 'current competitor/demand research included' else 'product-gap research still required' end),
      'Build only after the product hypothesis passes a concrete validation; keep the first version scoped to the shared painful job.',
      'Use the source communities, marketplaces, and direct outreach to the users represented by the evidence.',
      coalesce(r.market_pricing_hypothesis,
        case when r.service_spend_signal_count>0 then 'Start with a paid concierge pilot; recurring SaaS pricing is not proven yet.' else 'Validate willingness to pay before setting recurring pricing.' end),
      7,14,
      case when r.decision='validate' then 'validate' else 'research' end,
      r.score,r.overall_conf,r.problem_conf,r.product_conf,r.decision,
      coalesce(r.market_biggest_risk,
        case
          when not r.current_research then 'Problem evidence exists, but the product gap and recurring willingness to pay are not yet researched.'
          when r.product_conf<50 then 'The problem is more proven than demand for this specific product shape.'
          else 'Evidence can still fail to convert into paid adoption; validate with a real commitment.'
        end),
      case when r.decision='validate'
        then 'Offer a paid/manual pilot to qualified users and require a real commitment before building the full SaaS.'
        else 'Research the gap and interview users; do not build a full MVP until product-specific demand is stronger.'
      end,
      'theme-v2.1',now(),now()
    )
    on conflict (theme_id) where theme_id is not null do update set
      title=excluded.title,thesis=excluded.thesis,pain_summary=excluded.pain_summary,why_now=excluded.why_now,
      pricing_hypothesis=excluded.pricing_hypothesis,
      status=case when public.opportunities.status in ('build','winner') then public.opportunities.status else excluded.status end,
      opportunity_score=excluded.opportunity_score,confidence_score=excluded.confidence_score,
      problem_confidence_score=excluded.problem_confidence_score,product_confidence_score=excluded.product_confidence_score,
      decision_tier=case when public.opportunities.status in ('build','winner') then 'build' else excluded.decision_tier end,
      biggest_risk=excluded.biggest_risk,validation_experiment=excluded.validation_experiment,
      score_version=excluded.score_version,generated_at=now(),updated_at=now()
    returning id into v_opp_id;

    insert into public.opportunity_score_breakdown(
      opportunity_id,pain,willingness_to_pay,reachability,frequency,growth_timing,
      competitor_gap,buildability,recurring_revenue,evidence_confidence,penalty,final_score,score_version
    ) values (
      v_opp_id,r.avg_pain,r.calibrated_wtp,r.preliminary_reach,r.freq,r.timing,r.gap,r.buildability,r.recurring,
      r.overall_conf/10,least(8,r.regulatory_risk*0.8),r.score,'theme-v2.1'
    );

    v_count:=v_count+1;
    if r.decision in ('validate','research') and array_length(v_top,1) is distinct from 5 then
      v_top:=array_append(v_top,v_opp_id);
    elsif array_length(v_watch,1) is distinct from 3 then
      v_watch:=array_append(v_watch,v_opp_id);
    end if;
  end loop;

  insert into public.weekly_reports(week_start,week_end,generated_at,summary,top_opportunity_ids,watchlist_opportunity_ids,changes)
  values(
    v_week_start,v_week_end,now(),
    format('Generated %s evidence-calibrated opportunity themes. Problem confidence and product confidence are scored separately.',v_count),
    v_top,v_watch,
    jsonb_build_object('generated',v_count,'mode','theme-v2.1','confidence_model','problem-vs-product')
  )
  on conflict(week_start) do update set
    week_end=excluded.week_end,generated_at=excluded.generated_at,summary=excluded.summary,
    top_opportunity_ids=excluded.top_opportunity_ids,watchlist_opportunity_ids=excluded.watchlist_opportunity_ids,
    changes=excluded.changes;

  return v_count;
end;
$$;
revoke execute on function public.radar_theme_rank() from public,anon,authenticated;

create or replace function public.radar_refresh_and_rank()
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_themes integer:=0;
  v_metrics integer:=0;
  v_ranked integer:=0;
  v_mode text;
begin
  v_themes:=public.refresh_opportunity_themes();
  v_metrics:=public.radar_refresh_evidence_metrics();
  v_ranked:=public.radar_theme_rank();
  if v_ranked>0 then
    v_mode:='theme-v2.1';
  else
    v_ranked:=public.radar_weekly_rank();
    v_mode:='cross-source-v1.2.1';
  end if;
  return jsonb_build_object('themes',v_themes,'metrics',v_metrics,'ranked',v_ranked,'mode',v_mode);
end;
$$;
revoke execute on function public.radar_refresh_and_rank() from public,anon,authenticated;

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
        order by
          case s.decision_tier when 'build' then 4 when 'validate' then 3 when 'research' then 2 else 1 end desc,
          (greatest(0::numeric,least(100::numeric,s.opportunity_score+(s.market_fit-5)*1.5))
            *(0.50+0.30*s.problem_confidence_score/100+0.20*s.product_confidence_score/100)) desc,
          s.id
      )::integer market_rank
    from market_scored s
  )
  insert into public.radar_scan_opportunities(
    scan_id,opportunity_id,market,rank,title,origin,status,opportunity_score,base_opportunity_score,
    market_fit_score,market_signal_count,market_evidence_count,confidence_score,
    problem_confidence_score,product_confidence_score,decision_tier,
    thesis,target_customer,why_now,mvp_scope,biggest_risk,pricing_hypothesis,time_to_validation_days,brief
  )
  select p_scan_id,r.id,r.market,r.market_rank,r.title,
    case when r.theme_id is not null then 'theme' else 'exact' end,r.status,
    round(r.market_score,2),r.opportunity_score,round(r.market_fit,2),r.matching_count,r.evidence_count,
    r.confidence_score,r.problem_confidence_score,r.product_confidence_score,r.decision_tier,
    r.thesis,r.target_customer,r.why_now,r.mvp_scope,r.biggest_risk,r.pricing_hypothesis,
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
          'ranking','evidence-calibrated-v2.1'
        )
      )
  where id=p_scan_id;
  return v_count;
end;
$$;
revoke execute on function public.radar_snapshot_scan(uuid,integer) from public,anon,authenticated;

create or replace function public.radar_weekly_rank()
returns integer
language plpgsql
security definer
set search_path=public
as $
declare
  r record;
  v_opp_id uuid;
  v_count integer:=0;
  v_top uuid[]:='{}';
  v_watch uuid[]:='{}';
  v_week_start date := (current_date - ((extract(isodow from current_date)::int)-1));
  v_week_end date := v_week_start + 6;
  v_has_semantic boolean;
begin
  select exists(select 1 from public.cluster_signals where assignment_method='semantic-v1.1') into v_has_semantic;

  for r in
    with stats as (
      select pc.id cluster_id,pc.name,pc.summary,pc.target_customer,pc.category,
        count(distinct s.id)::int signal_count,
        count(distinct coalesce(ri.id::text,s.id::text))::int evidence_unit_count,
        count(distinct src.key)::int source_key_count,
        count(distinct nullif(ri.author,''))::int author_count,
        avg(s.pain_score)::numeric pain,
        avg(s.evidence_quality_score)::numeric evidence,
        count(distinct s.id) filter(where src.kind='marketplace' or s.money_signal_type in ('job_post','bounty'))::int service_spend_count,
        count(distinct s.id) filter(
          where src.kind<>'marketplace'
            and lower(concat_ws(' ',ri.title,ri.body,s.problem,s.evidence_excerpt)) ~
              '(would pay|willing to pay|pay for (a|an|this|something)|looking for (a|an|some) (tool|app|service|alternative)|need (a|an) (tool|app|service))'
            and lower(concat_ws(' ',ri.title,ri.body,s.problem)) !~
              '(\bi built\b|\bi made\b|\bwe built\b|\bwe launched\b|\bmy saas\b|\bmy app\b|\bshow hn\b)'
        )::int direct_purchase_count,
        count(distinct s.id) filter(
          where src.kind<>'marketplace' and lower(concat_ws(' ',ri.title,ri.body,s.problem)) ~
            '(\bi built\b|\bi made\b|\bwe built\b|\bwe launched\b|\bmy saas\b|\bmy app\b|\bshow hn\b)'
        )::int self_promo_count,
        count(distinct coalesce(ri.id::text,s.id::text))
          filter(where s.published_at>=now()-interval '7 days')::int recent_count
      from public.problem_clusters pc
      join public.cluster_signals cs on cs.cluster_id=pc.id
      join public.signals s on s.id=cs.signal_id
      join public.sources src on src.id=s.source_id
      left join public.raw_items ri on ri.id=s.raw_item_id
      where pc.status<>'killed'
        and ((v_has_semantic and pc.clustering_version='semantic-v1.1' and cs.assignment_method='semantic-v1.1')
          or (not v_has_semantic and pc.clustering_version='heuristic-v1' and cs.assignment_method='heuristic-v1'))
      group by pc.id,pc.name,pc.summary,pc.target_customer,pc.category
    ), features as (
      select *,
        least(10,greatest(0,ln(greatest(evidence_unit_count,1)+1)/ln(2)*2.6))::numeric freq,
        least(10,greatest(0,recent_count::numeric/greatest(evidence_unit_count,1)*10))::numeric recency,
        case when category in ('developer-tool','browser-extension') then 8 else 6 end::numeric reach,
        case when category in ('developer-tool','browser-extension','automation','ai-tooling') then 8 else 6 end::numeric buildability,
        case when category in ('developer-tool','automation','ai-tooling','ecommerce') then 7 else 5 end::numeric recurring,
        least(10,service_spend_count::numeric + direct_purchase_count::numeric*1.5) calibrated_wtp,
        greatest(0,least(100,
          (least(source_key_count,4)::numeric/4*25) +
          (least(evidence_unit_count,6)::numeric/6*20) +
          (least(author_count+least(service_spend_count,2),5)::numeric/5*15) +
          (evidence/10*20) +
          (least(recent_count,4)::numeric/4*20) -
          least(20,self_promo_count::numeric/greatest(evidence_unit_count,1)*35)
        )) problem_conf,
        least(40,
          (least(direct_purchase_count,3)::numeric/3*20) +
          (least(service_spend_count,4)::numeric/4*10)
        ) product_conf
      from stats
      where evidence_unit_count>=2 or source_key_count>=2 or service_spend_count>=2
    ), scored as (
      select *,
        greatest(0,least(100,round((
          pain*20 + calibrated_wtp*20 + reach*15 + freq*10 + recency*10 +
          5*10 + buildability*10 + recurring*5
        )/10,2))) score
      from features
    )
    select *,
      round(problem_conf*0.55+product_conf*0.45,2) overall_conf,
      case when score>=48 and problem_conf>=48 then 'research' else 'scout' end decision
    from scored
    order by
      case when score>=48 and problem_conf>=48 then 2 else 1 end desc,
      (score*(0.55+0.45*problem_conf/100)) desc
    limit 10
  loop
    insert into public.opportunities(
      cluster_id,theme_id,title,thesis,target_customer,pain_summary,why_now,mvp_scope,
      acquisition_channel,pricing_hypothesis,time_to_validation_days,time_to_money_days,status,
      opportunity_score,confidence_score,problem_confidence_score,product_confidence_score,decision_tier,
      biggest_risk,validation_experiment,score_version,generated_at,updated_at
    ) values (
      r.cluster_id,null,r.name,
      format('Early exact-problem signal: %s evidence unit(s) across %s source(s).',r.evidence_unit_count,r.source_key_count),
      r.target_customer,r.summary,
      format('Problem confidence %s%%; product confidence is capped because market/product-gap research is not available.',round(r.problem_conf,0)),
      'Do not build a full product from this exact cluster; first find repeated adjacent evidence or validate manually.',
      'Source communities and direct outreach',
      case when r.service_spend_count>0 then 'Service spend exists, but recurring product pricing is unproven.' else 'No recurring pricing assumption yet.' end,
      7,21,'research',
      r.score,r.overall_conf,r.problem_conf,r.product_conf,r.decision,
      'This is an early exact-problem candidate without product-gap research.',
      'Interview or manually serve users first; promotion to validation requires a broader theme and market research.',
      'exact-v2.1',now(),now()
    )
    on conflict(cluster_id) do update set
      title=excluded.title,thesis=excluded.thesis,target_customer=excluded.target_customer,pain_summary=excluded.pain_summary,
      why_now=excluded.why_now,opportunity_score=excluded.opportunity_score,confidence_score=excluded.confidence_score,
      problem_confidence_score=excluded.problem_confidence_score,product_confidence_score=excluded.product_confidence_score,
      decision_tier=excluded.decision_tier,biggest_risk=excluded.biggest_risk,score_version=excluded.score_version,
      status=case when public.opportunities.status in ('build','winner') then public.opportunities.status else excluded.status end,
      generated_at=now(),updated_at=now()
    returning id into v_opp_id;

    v_count:=v_count+1;
    if r.decision='research' and array_length(v_top,1) is distinct from 5 then
      v_top:=array_append(v_top,v_opp_id);
    elsif array_length(v_watch,1) is distinct from 3 then
      v_watch:=array_append(v_watch,v_opp_id);
    end if;
  end loop;

  insert into public.weekly_reports(week_start,week_end,generated_at,summary,top_opportunity_ids,watchlist_opportunity_ids,changes)
  values(v_week_start,v_week_end,now(),
    format('Generated %s conservative exact-cluster candidates; no exact cluster is auto-promoted to validation.',v_count),
    v_top,v_watch,jsonb_build_object('generated',v_count,'mode','exact-v2.1'))
  on conflict(week_start) do update set
    week_end=excluded.week_end,generated_at=excluded.generated_at,summary=excluded.summary,
    top_opportunity_ids=excluded.top_opportunity_ids,watchlist_opportunity_ids=excluded.watchlist_opportunity_ids,changes=excluded.changes;
  return v_count;
end;
$;
revoke execute on function public.radar_weekly_rank() from public,anon,authenticated;

-- Seed the new confidence fields immediately from existing evidence.
select public.radar_refresh_evidence_metrics();
select public.radar_theme_rank();
