-- V2.2: continuously recalibrate exact-cluster scouts so legacy scores cannot bypass the V2.1 confidence model.

create or replace function public.radar_exact_scout_refresh()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  r record;
  v_opp_id uuid;
  v_count integer:=0;
  v_has_semantic boolean;
begin
  select exists(select 1 from public.cluster_signals where assignment_method='semantic-v1.1') into v_has_semantic;

  -- Retire stale exact opportunities from the active ranking before recomputing the current scout pool.
  update public.opportunities
  set status='watching', decision_tier='scout', updated_at=now()
  where theme_id is null
    and status in ('research','validate')
    and score_version <> 'exact-v2.2';

  for r in
    with stats as (
      select
        pc.id cluster_id,pc.name,pc.summary,pc.target_customer,pc.category,
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
              '(would pay|willing to pay|pay for (a|an|this|something)|looking for (a|an|some) (tool|app|service|alternative)|need (a|an) (tool|app|service)|any (tool|app|service).*(for|that))'
            and lower(concat_ws(' ',ri.title,ri.body,s.problem)) !~
              '(\bi built\b|\bi made\b|\bwe built\b|\bwe made\b|\bwe launched\b|\blaunching my\b|\bmy saas\b|\bmy app\b|\bshow hn\b|\bintroducing our\b)'
        )::int direct_purchase_count,
        count(distinct s.id) filter(
          where src.kind<>'marketplace'
            and lower(concat_ws(' ',ri.title,ri.body,s.problem)) ~
              '(\bi built\b|\bi made\b|\bwe built\b|\bwe made\b|\bwe launched\b|\blaunching my\b|\bmy saas\b|\bmy app\b|\bshow hn\b|\bintroducing our\b)'
        )::int self_promo_count,
        count(distinct coalesce(ri.id::text,s.id::text))
          filter(where s.published_at>=now()-interval '7 days')::int recent_count
      from public.problem_clusters pc
      join public.cluster_signals cs on cs.cluster_id=pc.id
      join public.signals s on s.id=cs.signal_id
      join public.sources src on src.id=s.source_id
      left join public.raw_items ri on ri.id=s.raw_item_id
      where pc.status<>'killed'
        and (
          (v_has_semantic and pc.clustering_version='semantic-v1.1' and cs.assignment_method='semantic-v1.1')
          or
          (not v_has_semantic and pc.clustering_version='heuristic-v1' and cs.assignment_method='heuristic-v1')
        )
        and not exists (
          select 1
          from public.theme_clusters tc
          join public.opportunity_themes ot on ot.id=tc.theme_id
          where tc.cluster_id=pc.id
            and ot.theme_version='theme-v1.0'
            and ot.status<>'killed'
        )
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
      where evidence_unit_count>=2
         or source_key_count>=2
         or service_spend_count>=2
         or (direct_purchase_count>=1 and evidence>=8)
    ), scored as (
      select *,
        greatest(0,least(100,round((
          pain*20 + calibrated_wtp*20 + reach*15 + freq*10 + recency*10 +
          5*10 + buildability*10 + recurring*5
        )/10,2))) score
      from features
    ), decided as (
      select *,
        round(problem_conf*0.55+product_conf*0.45,2) overall_conf,
        case when score>=48 and problem_conf>=48 then 'research' else 'scout' end decision
      from scored
    )
    select *
    from decided
    order by
      case decision when 'research' then 2 else 1 end desc,
      (score*(0.55+0.45*problem_conf/100)) desc
    limit 20
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
      format('Problem confidence %s%%; product confidence is intentionally capped until broader market/product-gap research exists.',round(r.problem_conf,0)),
      'Do not build a full product yet; first confirm repetition or manually validate the shared painful job.',
      'Source communities and direct outreach',
      case when r.service_spend_count>0 then 'Service spend exists, but recurring product pricing is unproven.' else 'No recurring pricing assumption yet.' end,
      7,21,'research',
      r.score,r.overall_conf,r.problem_conf,r.product_conf,r.decision,
      'This is an early exact-problem candidate without full product-gap research.',
      'Interview or manually serve users first; promotion to validation requires a broader theme and product-specific market evidence.',
      'exact-v2.2',now(),now()
    )
    on conflict(cluster_id) do update set
      title=excluded.title,thesis=excluded.thesis,target_customer=excluded.target_customer,pain_summary=excluded.pain_summary,
      why_now=excluded.why_now,mvp_scope=excluded.mvp_scope,pricing_hypothesis=excluded.pricing_hypothesis,
      opportunity_score=excluded.opportunity_score,confidence_score=excluded.confidence_score,
      problem_confidence_score=excluded.problem_confidence_score,product_confidence_score=excluded.product_confidence_score,
      decision_tier=excluded.decision_tier,biggest_risk=excluded.biggest_risk,validation_experiment=excluded.validation_experiment,
      score_version=excluded.score_version,
      status=case when public.opportunities.status in ('build','winner') then public.opportunities.status else excluded.status end,
      generated_at=now(),updated_at=now()
    returning id into v_opp_id;

    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$$;
revoke execute on function public.radar_exact_scout_refresh() from public,anon,authenticated;

create or replace function public.radar_refresh_and_rank()
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_themes integer:=0;
  v_metrics integer:=0;
  v_theme_ranked integer:=0;
  v_exact_ranked integer:=0;
  v_mode text;
begin
  v_themes:=public.refresh_opportunity_themes();
  v_metrics:=public.radar_refresh_evidence_metrics();
  v_theme_ranked:=public.radar_theme_rank();
  v_exact_ranked:=public.radar_exact_scout_refresh();

  if v_theme_ranked>0 then
    v_mode:='theme+exact-v2.2';
  else
    v_mode:='exact-v2.2';
  end if;

  return jsonb_build_object(
    'themes',v_themes,
    'metrics',v_metrics,
    'theme_ranked',v_theme_ranked,
    'exact_ranked',v_exact_ranked,
    'ranked',v_theme_ranked+v_exact_ranked,
    'mode',v_mode
  );
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
      and (
        o.score_version in ('theme-v2.1','exact-v2.2')
        or o.status in ('build','winner')
      )
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
  from ranked r
  left join public.opportunity_briefs b on b.opportunity_id=r.id
  where r.market_rank<=greatest(1,least(coalesce(p_limit,5),10))
  order by r.market,r.market_rank;

  get diagnostics v_count=row_count;
  update public.radar_scans
  set opportunities_snapshot_count=v_count,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'market_snapshots',jsonb_build_object(
          'us',least(greatest(coalesce(p_limit,5),1),10),
          'eu',least(greatest(coalesce(p_limit,5),1),10),
          'ranking','evidence-calibrated-v2.2'
        )
      )
  where id=p_scan_id;

  return v_count;
end;
$$;
revoke execute on function public.radar_snapshot_scan(uuid,integer) from public,anon,authenticated;

select public.radar_refresh_and_rank();
