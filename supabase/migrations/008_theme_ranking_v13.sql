-- Opportunity Radar V1.3 theme ranking.

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
    with eligible as (
      select ot.*,tm.*,
             least(10,greatest(0,ln(tm.signal_count+1)/ln(2)*2.6))::numeric as freq,
             least(10,greatest(0,tm.recent_signal_count::numeric/greatest(tm.signal_count,1)*10))::numeric as recency,
             case when ot.category in ('developer-tool','browser-extension') then 8 else 6 end::numeric as reach,
             case when ot.category in ('developer-tool','browser-extension','automation','ai-tooling') then 8 else 6 end::numeric as buildability,
             case when ot.category in ('developer-tool','automation','ai-tooling','ecommerce') then 7 else 5 end::numeric as recurring,
             least(10,5 + case when tm.exact_cluster_count>=3 then 1 else 0 end + case when tm.money_signal_count>=2 then 1 else 0 end + case when tm.independent_source_count>=2 then 2 else 0 end)::numeric as gap
      from public.opportunity_themes ot
      join public.theme_metrics tm on tm.theme_id=ot.id
      where ot.theme_version='theme-v1.0'
        and ot.status<>'killed'
        and tm.exact_cluster_count>=2
        and (tm.independent_source_count>=2 or tm.money_signal_count>=2)
    ), scored as (
      select *,
        round((avg_pain*20 + avg_purchase_intent*20 + reach*15 + freq*10 + recency*10 + gap*10 + buildability*10 + recurring*5)/10,2) as score,
        round(least(100,
          (least(independent_source_count,4)::numeric/4*35) +
          (least(money_signal_count,4)::numeric/4*25) +
          (avg_evidence_quality/10*20) +
          (recency/10*20)
        ),2) as confidence
      from eligible
    )
    select * from scored
    order by (score*(0.55+0.45*confidence/100)) desc
    limit 10
  loop
    insert into public.opportunities(
      cluster_id,theme_id,title,thesis,target_customer,pain_summary,why_now,mvp_scope,
      acquisition_channel,pricing_hypothesis,time_to_validation_days,time_to_money_days,status,
      opportunity_score,confidence_score,biggest_risk,validation_experiment,score_version,generated_at,updated_at
    ) values (
      null,r.id,r.name,
      case when r.independent_source_count>=2 and r.money_signal_count>0
        then 'Repeated opportunity theme confirmed by independent platforms and direct money evidence.'
        else 'Repeated paid problem pattern confirmed across multiple exact problem clusters.' end,
      null,r.summary,
      format('%s exact clusters, %s signals, %s platform(s), %s money signals, confidence %s%%.',r.exact_cluster_count,r.signal_count,r.independent_source_count,r.money_signal_count,r.confidence),
      'Build the smallest product that solves the common job shared across the repeated exact problems.',
      'Source communities, paid marketplaces, direct outreach, and users represented by the underlying evidence.',
      case when r.money_signal_count>=2 then 'Start with a paid pilot; test recurring pricing only after repeat usage.' else 'Validate willingness to pay before recurring pricing.' end,
      7,14,
      case when r.score>=70 and r.confidence>=55 then 'validate' else 'research' end,
      r.score,r.confidence,
      case when r.independent_source_count<2 then 'Demand repeats, but currently within one platform.' else 'The broad theme may hide distinct sub-problems; validate the shared job before building.' end,
      'Interview users from at least two underlying exact clusters and ask for a paid commitment to one shared MVP.',
      'theme-v1.0',now(),now()
    )
    on conflict (theme_id) where theme_id is not null do update set
      title=excluded.title,thesis=excluded.thesis,pain_summary=excluded.pain_summary,why_now=excluded.why_now,
      status=excluded.status,opportunity_score=excluded.opportunity_score,confidence_score=excluded.confidence_score,
      biggest_risk=excluded.biggest_risk,validation_experiment=excluded.validation_experiment,
      score_version=excluded.score_version,generated_at=now(),updated_at=now()
    returning id into v_opp_id;

    insert into public.opportunity_score_breakdown(
      opportunity_id,pain,willingness_to_pay,reachability,frequency,growth_timing,
      competitor_gap,buildability,recurring_revenue,evidence_confidence,penalty,final_score,score_version
    ) values (
      v_opp_id,r.avg_pain,r.avg_purchase_intent,r.reach,r.freq,r.recency,r.gap,r.buildability,r.recurring,r.confidence/10,0,r.score,'theme-v1.0'
    );

    v_count:=v_count+1;
    if v_count<=5 then v_top:=array_append(v_top,v_opp_id);
    elsif v_count<=8 then v_watch:=array_append(v_watch,v_opp_id);
    end if;
  end loop;

  if v_count>0 then
    insert into public.weekly_reports(week_start,week_end,generated_at,summary,top_opportunity_ids,watchlist_opportunity_ids,changes)
    values(v_week_start,v_week_end,now(),format('Generated %s ranked opportunity themes.',v_count),v_top,v_watch,jsonb_build_object('generated',v_count,'mode','theme-v1.0'))
    on conflict(week_start) do update set
      week_end=excluded.week_end,generated_at=excluded.generated_at,summary=excluded.summary,
      top_opportunity_ids=excluded.top_opportunity_ids,watchlist_opportunity_ids=excluded.watchlist_opportunity_ids,changes=excluded.changes;
  end if;

  return v_count;
end;
$$;

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

revoke all on function public.radar_theme_rank() from public;
revoke all on function public.radar_refresh_and_rank() from public;

-- In production pg_cron, point the weekly job at:
-- select public.radar_refresh_and_rank();
