-- V2.9: remove generated GitHub reports and copied Freelancer jobs from demand.
-- Never treat two posts by one reporter as independent buyer validation.

CREATE OR REPLACE FUNCTION public.radar_process_pending(p_limit integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_text text;
  v_category text;
  v_slug text;
  v_pain integer;
  v_purchase integer;
  v_urgency integer;
  v_evidence integer;
  v_relevance integer;
  v_money_type text;
  v_signal_id uuid;
  v_cluster_id uuid;
  v_processed integer := 0;
  v_direct_product boolean;
  v_service_spend boolean;
  v_explicit_problem boolean;
  v_self_promo boolean;
  v_noise boolean;
  v_actionable boolean;
  v_new_github_collector boolean;
  v_evidence_role text;
  v_hn_demand boolean;
  v_freelancer_duplicate boolean;
begin
  for r in
    select ri.*, s.key as source_key, s.kind as source_kind
    from public.raw_items ri
    join public.sources s on s.id = ri.source_id
    where ri.processed_at is null
    order by ri.published_at desc
    limit p_limit
  loop
    v_text := lower(coalesce(r.title,'') || ' ' || coalesce(r.body,''));
    v_new_github_collector := r.source_key='github' and coalesce(r.raw_payload->>'collector','') in ('github-demand-v1.3','github-demand-v1.4');

    v_evidence_role := case
      when coalesce(r.raw_payload->>'evidence_role','') in ('problem_demand','launch_competitor','market_context','service_spend')
        then r.raw_payload->>'evidence_role'
      when r.source_kind='marketplace' then 'service_spend'
      when r.source_key='hackernews' and coalesce(r.raw_payload->>'evidence_role','') in ('problem_demand','launch_competitor','market_context')
        then r.raw_payload->>'evidence_role'
      when r.source_key='hackernews' and coalesce(r.raw_payload->'_tags','[]'::jsonb) ? 'show_hn' then 'launch_competitor'
      when r.source_key='hackernews' and coalesce(r.raw_payload->'_tags','[]'::jsonb) ? 'ask_hn' then 'problem_demand'
      when r.source_key='hackernews' then 'market_context'
      else 'problem_demand'
    end;

    v_direct_product := v_text ~
      '(would pay|willing to pay|pay for (a|an|this|something)|looking for (a|an|some) (tool|app|service|alternative)|need (a|an) (tool|app|service)|any (tool|app|service).{0,50}(for|that)|paid (tool|app|service)|subscription.{0,40}(need|worth|looking))';

    -- Quoting "pay for a better plan" while saying it is unaffordable
    -- is not a purchase commitment. Keep the pain, remove false WTP.
    if r.source_key='hackernews'
       and v_text ~ '(can''t (currently )?(really )?afford|cannot afford|unable to afford|not willing to pay)'
       and v_text !~ '(would pay|willing to pay|looking for (a|an|some) (tool|app|service|alternative))' then
      v_direct_product:=false;
    end if;

    v_service_spend := v_text ~
      '(hiring|hire (a|an|someone|developer|freelancer|contractor)|looking for (a|an) (developer|freelancer|contractor)|freelancer needed|contractor needed|bounty|cash reward|paid bounty)';

    v_explicit_problem := v_text ~
      '(feature request|is your feature request related to a problem|what problem are you hitting|currently .{0,60}(cannot|can''t|doesn''t|does not|fails|missing)|there is no way|no way to|wish (there|i|we)|need (a way|to|an? tool)|looking for (an? )?(tool|alternative|way)|manual(ly)?|tedious|time-consuming|frustrat|pain point|struggle|blocked|keeps? (failing|breaking)|doesn''t work|does not work|not working|broken|stopped working|crash|freeze|unusable|bug|fails?)';

    v_self_promo := v_text ~
      '(^|[[:space:][:punct:]])(show hn|launch hn|i built|i made|i''m building|i am building|we built|we made|we launched|we''re building|we are building|launching my|my saas|my app|my tool|my extension|introducing our)([[:space:][:punct:]]|$)'
      or (
        r.source_key='hackernews'
        and v_text ~ '(looking for feedback on (the|my|our) beta|rolling out|available (on|in) (the )?(chrome web store|app store|play store)|chrome web store|try it|check it out|source:[ ]*https?://|demo:[ ]*https?://|search ["“''][^"”'']+["”''] in)'
      );

    if r.source_key='hackernews'
       and v_evidence_role='problem_demand'
       and v_self_promo then
      v_evidence_role := 'launch_competitor';
      v_direct_product := false;
    end if;

    v_hn_demand := r.source_key='hackernews'
      and v_evidence_role='problem_demand'
      and (
        v_explicit_problem
        or v_direct_product
        or v_text ~ '(what do you miss|what is missing|what are you missing|which (tool|service|app)|any (good )?(tool|service|alternative)|recommend(ation|ations)? for|looking for|alternative to|current options are|too tedious|manual(ly)? review|hours of time|keeps? (failing|breaking)|cannot|can''t|doesn''t|does not|annoying|frustrating|pain point|undefendable|fraud risk|missing feature|there is always .* missing)'
      );

    v_noise := false;
    if r.source_key='github' then
      v_noise :=
        lower(coalesce(r.author,'')) like '%[bot]'
        or lower(coalesce(r.raw_payload->'user'->>'type',''))='bot'
        or r.title ~ '(日报|周报|简报|社区动态)'
        or lower(trim(coalesce(r.title,''))) like 'scheduled agent:%'
        or lower(trim(coalesce(r.title,''))) like 'product:%'
        or lower(trim(coalesce(r.title,''))) like '[done]%'
        or lower(trim(coalesce(r.title,''))) ~ '^/[a-z0-9_-]+:'
        or lower(coalesce(r.title,'')) ~ '(daily|weekly)[[:space:]]+(digest|report|roundup|summary)'
        or lower(coalesce(r.title,'')) like '%catalog alignment%'
        or v_text ~ '(researched in full in|this issue records why|docs/findings[.]md)'
        or (lower(coalesce(r.body,'')) like '%## mission%' and lower(coalesce(r.body,'')) ~ '(exploratory workflow|start the application|pnpm dev)')
        or lower(coalesce(r.title,'')) ~ '^(fix|feat|chore|docs|test|tests|refactor|ci|build|release|perf|spec|research|prd|deep-review|fork watch|daily|weekly|phase[ ]*[0-9]*|history|master index|team-status|curriculum-eval)(\(|:|[ ]|—|-|\[)'
        or lower(coalesce(r.title,'')) ~ '^\[(phase|roadmap|epic)[ ]*[0-9]*\]'
        or v_text ~ '(best .{0,40}(agency|company)|digital marketing agency|industrial training|build your career|career with|internship program|seo services|web development company|youtube links|ссылки youtube|sample feature request for testing|test feature issue for automation|invoice ocr api:[ ]*automate)'
        or v_text ~ '(daily repository status report|master index \(|fork watch:|deep manual audit|this issue does not authorize|definition of done for this issue|current checkpoint:|implementation repository:|parent roadmap:|blocked by:[ ]*#[0-9]|implement only after|parent issue:[ ]*#[0-9]|subtask of #[0-9])'
        or lower(coalesce(r.body,'')) ~ '^part of #[0-9]+';
    end if;

    v_category := case
      when v_text ~ '(chrome|browser|extension|firefox)' then 'browser-extension'
      when v_text ~ '(api|sdk|typescript|javascript|react|next\.js|developer|github|ci/cd|devops|debug|kubernetes)' then 'developer-tool'
      when v_text ~ '(ai|llm|gpt|agent|model|prompt|mcp)' then 'ai-tooling'
      when v_text ~ '(video|youtube|tiktok|creator|subtitle|podcast|shorts)' then 'creator-tooling'
      when v_text ~ '(shopify|woocommerce|ecommerce|merchant)' then 'ecommerce'
      when v_text ~ '(game|gaming|unity|pixi|casino|slot)' then 'gaming'
      when v_text ~ '(automation|workflow|manual|manually|zapier|make\.com|n8n)' then 'automation'
      else 'general-software'
    end;

    v_pain := 3
      + case when v_text ~ '(manual|manually|tedious|annoying|time-consuming)' then 2 else 0 end
      + case when v_text ~ '(hate|pain|broken|frustrating|problem|difficult|struggle|missing|cannot|can''t)' then 2 else 0 end
      + case when v_text ~ '(hours|slow|blocked|blocking|keeps? (failing|breaking))' then 1 else 0 end;
    v_pain := least(10, v_pain);

    v_purchase := case
      when v_evidence_role in ('launch_competitor','market_context') then 1
      when r.source_kind='marketplace' then 6
      when v_direct_product then 8
      when v_service_spend then 6
      when v_text ~ '(pricing|subscription|paid plan|expensive)' then 2
      else 1
    end;

    v_urgency := 2 + case when v_text ~ '(urgent|asap|critical|blocked|blocking|need now|this week)' then 4 else 0 end;
    v_urgency := least(10, v_urgency);

    v_evidence := least(10,
      4
      + case when length(coalesce(r.body,'')) > 250 then 2 else 0 end
      + case when v_direct_product then 2 else 0 end
      + case when v_service_spend or r.source_kind='marketplace' then 1 else 0 end
      + case when r.source_key='hackernews' and v_evidence_role='problem_demand'
                  and coalesce(nullif(r.raw_payload->>'num_comments','')::int,0) >= 3 then 1 else 0 end
      + case when r.source_key='hackernews' and v_evidence_role='problem_demand'
                  and coalesce(nullif(r.raw_payload->>'num_comments','')::int,0) >= 10 then 1 else 0 end
    );

    v_relevance := least(10, greatest(1, round(v_pain*0.45 + v_purchase*0.35 + v_evidence*0.20)::integer));

    v_money_type := case
      when v_evidence_role in ('launch_competitor','market_context') then 'none'
      when r.source_key='freelancer' then 'job_post'
      when v_text ~ '(bounty|cash reward|paid bounty)' then 'bounty'
      when v_service_spend then 'job_post'
      when v_direct_product then 'purchase_request'
      when r.source_key='hackernews' then 'none'
      when v_text ~ '(budget|pay|paid|bounty|reward|hire|contract)' and v_text ~ '([$€£][ ]?[0-9]{2,})' then 'budget'
      else 'none'
    end;

    v_actionable := case
      when r.source_key='github' and v_new_github_collector then
        not v_noise and not v_self_promo and v_explicit_problem and v_evidence>=6
      when r.source_key='github' then
        not v_noise and not v_self_promo and v_explicit_problem and (v_relevance>=5 or v_direct_product or v_service_spend)
      when r.source_key='reddit' then
        not v_self_promo and v_explicit_problem and v_relevance>=5
      when r.source_key='hackernews' then
        v_hn_demand
        and not v_self_promo
        and v_relevance>=4
      when r.source_key='stackoverflow' then
        (v_direct_product or v_service_spend) and v_relevance>=6
      when r.source_key='freelancer' then
        coalesce(r.raw_payload->>'demand_class','')='repeatable_workflow'
        and v_relevance>=4
      when r.source_key='amo_reviews' then
        coalesce(nullif(r.raw_payload->>'score','')::int,0) in (1,2)
        and v_explicit_problem
        and v_relevance>=4
      when r.source_kind='marketplace' then
        v_relevance>=5
      else
        (v_explicit_problem or v_money_type<>'none') and v_relevance>=6
    end;

    -- Multiple Freelancer IDs can point to the same buyer brief with only the
    -- scraped budget changed. A copied brief is not an independent buyer.
    v_freelancer_duplicate := false;
    if r.source_key='freelancer' and v_actionable then
      v_freelancer_duplicate :=
        length(trim(regexp_replace(coalesce(split_part(r.body,E'\nSkills:',1),''),'^Budget:[^.]{1,70}\.[[:space:]]*','','i'))) >= 40
        and exists (
          select 1
          from public.raw_items older
          where older.source_id=r.source_id
            and older.id<>r.id
            and (coalesce(older.published_at,older.fetched_at),older.id)
                 < (coalesce(r.published_at,r.fetched_at),r.id)
            and lower(trim(coalesce(older.title,'')))=lower(trim(coalesce(r.title,'')))
            and lower(trim(regexp_replace(coalesce(split_part(older.body,E'\nSkills:',1),''),'^Budget:[^.]{1,70}\.[[:space:]]*','','i')))
                =lower(trim(regexp_replace(coalesce(split_part(r.body,E'\nSkills:',1),''),'^Budget:[^.]{1,70}\.[[:space:]]*','','i')))
        );
      if v_freelancer_duplicate then
        v_actionable:=false;
      end if;
    end if;

    insert into public.signals(
      raw_item_id, source_id, published_at, persona, industry, category,
      problem, workflow, workaround, evidence_excerpt, pain_score, urgency_score,
      purchase_intent_score, money_signal_type, evidence_quality_score,
      relevance_score, is_actionable, evidence_role, extraction_version
    ) values (
      r.id, r.source_id, r.published_at,
      case
        when r.source_key='github' then 'software team / developer'
        when r.source_key='reddit' then 'founder / operator / developer'
        when r.source_key='amo_reviews' then 'browser extension user'
        when r.source_kind='marketplace' then 'buyer seeking implementation'
        else 'tech/startup operator'
      end,
      v_category, v_category, r.title, null,
      case when v_text ~ '(manual|manually)' then 'Manual workflow mentioned in source' else null end,
      left(coalesce(r.title,'') || case when coalesce(r.body,'')<>'' then E'\n' || r.body else '' end, 900),
      v_pain, v_urgency, v_purchase, v_money_type, v_evidence, v_relevance,
      v_actionable, v_evidence_role, 'sql-heuristic-v1.8'
    )
    on conflict (raw_item_id) do update set
      persona=excluded.persona,
      industry=excluded.industry,
      category=excluded.category,
      pain_score=excluded.pain_score,
      urgency_score=excluded.urgency_score,
      purchase_intent_score=excluded.purchase_intent_score,
      money_signal_type=excluded.money_signal_type,
      evidence_quality_score=excluded.evidence_quality_score,
      relevance_score=excluded.relevance_score,
      is_actionable=excluded.is_actionable,
      evidence_role=excluded.evidence_role,
      extraction_version=excluded.extraction_version
    returning id into v_signal_id;

    if not v_actionable
       or v_evidence_role in ('launch_competitor','market_context') then
      update public.raw_items set processed_at=now() where id=r.id;
      v_processed:=v_processed+1;
      continue;
    end if;

    v_slug := trim(both '-' from v_category || '-' || left(regexp_replace(lower(r.title),'[^a-z0-9]+','-','g'),80));
    if length(v_slug) < length(v_category)+3 then
      v_slug := v_category || '-' || substr(md5(r.title),1,12);
    end if;

    insert into public.problem_clusters(slug,name,summary,target_customer,category,last_seen_at)
    values (
      v_slug,left(r.title,120),r.title,
      case
        when r.source_key='github' then 'software teams and developers'
        when r.source_kind='marketplace' then 'buyers seeking implementation'
        else 'tech/startup operators'
      end,
      v_category,r.published_at
    )
    on conflict (slug) do update set
      last_seen_at=greatest(public.problem_clusters.last_seen_at,excluded.last_seen_at),
      updated_at=now()
    returning id into v_cluster_id;

    insert into public.cluster_signals(cluster_id,signal_id,assignment_method)
    values (v_cluster_id,v_signal_id,'sql-heuristic-v1.8')
    on conflict (cluster_id,signal_id) do nothing;

    update public.raw_items set processed_at=now() where id=r.id;
    v_processed:=v_processed+1;
  end loop;
  return v_processed;
end;
$function$
;

revoke execute on function public.radar_process_pending(integer) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.radar_exact_scout_refresh()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_opp_id uuid;
  v_count integer:=0;
  v_has_semantic boolean;
begin
  select exists(select 1 from public.cluster_signals where assignment_method='semantic-v1.2') into v_has_semantic;

  -- Every refresh starts by retiring non-manual exact candidates. Current candidates
  -- are reactivated below; candidates that lost valid evidence remain Scouts/watchers.
  update public.opportunities
  set status='watching',
      decision_tier='scout',
      score_version=case when score_version='exact-v2.2' then 'exact-v2.2-retired' else score_version end,
      updated_at=now()
  where theme_id is null
    and status in ('research','validate','watching')
    and status not in ('build','winner');

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
        and s.is_actionable
        and s.evidence_role in ('problem_demand','service_spend')
        and (
          (v_has_semantic and pc.clustering_version='semantic-v1.2' and cs.assignment_method='semantic-v1.2')
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
      where (
          evidence_unit_count>=2
          and (source_key_count>=2 or author_count>=2 or service_spend_count>=2)
        )
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
      7,21,case when r.decision='research' then 'research' else 'watching' end,
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
$function$
;

revoke execute on function public.radar_exact_scout_refresh() from public,anon,authenticated;

-- Recheck the current versioned GitHub corpus using the revised noise rules.
-- Do not resurrect the quarantined unversioned GitHub/Reddit corpus.
update public.raw_items ri
set processed_at=null
from public.sources src
where src.id=ri.source_id
  and src.key='github'
  and coalesce(ri.raw_payload->>'collector','') in ('github-demand-v1.3','github-demand-v1.4');

-- Re-score HN as well: quoted expensive-plan advice does not mean a buyer will pay.
update public.raw_items ri
set processed_at=null
from public.sources src
where src.id=ri.source_id
  and src.key='hackernews'
  and coalesce(ri.raw_payload->>'collector','') like 'hn-v1.%';

select public.radar_process_pending(1000);

-- One-time backfill for previously stored copied Freelancer briefs.
with normalized as (
  select s.id,
    row_number() over (
      partition by ri.source_id,lower(trim(coalesce(ri.title,''))),lower(trim(regexp_replace(coalesce(split_part(ri.body,E'\nSkills:',1),''),'^Budget:[^.]{1,70}\.[[:space:]]*','','i')))
      order by coalesce(ri.published_at,ri.fetched_at),ri.id
    ) rn
  from public.signals s
  join public.raw_items ri on ri.id=s.raw_item_id
  join public.sources src on src.id=ri.source_id
  where src.key='freelancer'
    and length(lower(trim(regexp_replace(coalesce(split_part(ri.body,E'\nSkills:',1),''),'^Budget:[^.]{1,70}\.[[:space:]]*','','i'))))>=40
)
update public.signals s
set is_actionable=false,
    extraction_version='freelancer-duplicate-v1.8'
from normalized n
where n.id=s.id and n.rn>1 and s.is_actionable;

-- Invalidated demand cannot keep an old semantic link or cluster alive.
delete from public.cluster_signals cs
using public.signals s
where cs.signal_id=s.id
  and cs.assignment_method='semantic-v1.2'
  and (not s.is_actionable or s.evidence_role not in ('problem_demand','service_spend'));

update public.problem_clusters pc
set status='killed',updated_at=now()
where pc.clustering_version='semantic-v1.2'
  and pc.status<>'killed'
  and not exists (
    select 1 from public.cluster_signals cs
    join public.signals s on s.id=cs.signal_id
    where cs.cluster_id=pc.id
      and cs.assignment_method='semantic-v1.2'
      and s.is_actionable
      and s.evidence_role in ('problem_demand','service_spend')
  );

select public.refresh_semantic_cluster_metrics();
select public.radar_refresh_and_rank();
