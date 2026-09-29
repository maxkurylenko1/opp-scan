-- V2.5.2: HN demand recall guard + strict HN money evidence.
create or replace function public.radar_process_pending(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path='public'
as $function$
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
    v_new_github_collector := r.source_key='github' and coalesce(r.raw_payload->>'collector','')='github-demand-v1.3';

    v_evidence_role := case
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

    v_service_spend := v_text ~
      '(hiring|hire (a|an|someone|developer|freelancer|contractor)|looking for (a|an) (developer|freelancer|contractor)|freelancer needed|contractor needed|bounty|cash reward|paid bounty)';

    v_explicit_problem := v_text ~
      '(feature request|is your feature request related to a problem|what problem are you hitting|currently .{0,60}(cannot|can''t|doesn''t|does not|fails|missing)|there is no way|no way to|wish (there|i|we)|need (a way|to|an? tool)|looking for (an? )?(tool|alternative|way)|manual(ly)?|tedious|time-consuming|frustrat|pain point|struggle|blocked|keeps? (failing|breaking))';

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
        lower(coalesce(r.title,'')) ~ '^(fix|feat|chore|docs|test|tests|refactor|ci|build|release|perf|spec|research|prd|deep-review|fork watch|daily|weekly|phase[ ]*[0-9]*|history|master index|team-status|curriculum-eval)(\(|:|[ ]|—|-|\[)'
        or v_text ~ '(best .{0,40}(agency|company)|digital marketing agency|industrial training|build your career|career with|internship program|seo services|web development company|youtube links|ссылки youtube|sample feature request for testing|test feature issue for automation|invoice ocr api:[ ]*automate)'
        or v_text ~ '(daily repository status report|master index \(|fork watch:|deep manual audit|this issue does not authorize|definition of done for this issue|current checkpoint:|implementation repository:)'
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
      when r.source_kind='marketplace' then
        v_relevance>=5
      else
        (v_explicit_problem or v_money_type<>'none') and v_relevance>=6
    end;

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
        when r.source_kind='marketplace' then 'buyer seeking implementation'
        else 'tech/startup operator'
      end,
      v_category, v_category, r.title, null,
      case when v_text ~ '(manual|manually)' then 'Manual workflow mentioned in source' else null end,
      left(coalesce(r.title,'') || case when coalesce(r.body,'')<>'' then E'\n' || r.body else '' end, 900),
      v_pain, v_urgency, v_purchase, v_money_type, v_evidence, v_relevance,
      v_actionable, v_evidence_role, 'sql-heuristic-v1.4.2'
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
    values (v_cluster_id,v_signal_id,'sql-heuristic-v1.4.2')
    on conflict (cluster_id,signal_id) do nothing;

    update public.raw_items set processed_at=now() where id=r.id;
    v_processed:=v_processed+1;
  end loop;
  return v_processed;
end;
$function$;


revoke execute on function public.radar_process_pending(integer) from public,anon,authenticated;

with classified as (
  select
    s.id,
    lower(concat_ws(' ',ri.title,ri.body,s.problem,s.evidence_excerpt)) txt,
    coalesce((ri.raw_payload->>'num_comments')::int,0) comments,
    s.pain_score,
    case
      when lower(concat_ws(' ',ri.title,ri.body,s.problem,s.evidence_excerpt)) ~
        '(would pay|willing to pay|pay for (a|an|this|something)|looking for (a|an|some) (tool|app|service|alternative)|need (a|an) (tool|app|service)|any (tool|app|service).{0,50}(for|that)|paid (tool|app|service)|subscription.{0,40}(need|worth|looking))'
      then true else false
    end direct_product,
    case
      when lower(concat_ws(' ',ri.title,ri.body,s.problem,s.evidence_excerpt)) ~
        '(hiring|hire (a|an|someone|developer|freelancer|contractor)|looking for (a|an) (developer|freelancer|contractor)|freelancer needed|contractor needed|bounty|cash reward|paid bounty)'
      then true else false
    end service_spend,
    case
      when lower(concat_ws(' ',ri.title,ri.body,s.problem,s.evidence_excerpt)) ~
        '(feature request|is your feature request related to a problem|what problem are you hitting|currently .{0,60}(cannot|can''t|doesn''t|does not|fails|missing)|there is no way|no way to|wish (there|i|we)|need (a way|to|an? tool)|looking for (an? )?(tool|alternative|way)|manual(ly)?|tedious|time-consuming|frustrat|pain point|struggle|blocked|keeps? (failing|breaking))'
      then true else false
    end explicit_problem,
    case
      when lower(concat_ws(' ',ri.title,ri.body,s.problem,s.evidence_excerpt)) ~
        '(^|[[:space:][:punct:]])(show hn|launch hn|i built|i made|i''m building|i am building|we built|we made|we launched|we''re building|we are building|launching my|my saas|my app|my tool|my extension|introducing our)([[:space:][:punct:]]|$)'
        or lower(concat_ws(' ',ri.title,ri.body,s.problem,s.evidence_excerpt)) ~
        '(looking for feedback on (the|my|our) beta|rolling out|available (on|in) (the )?(chrome web store|app store|play store)|chrome web store|try it|check it out|source:[ ]*https?://|demo:[ ]*https?://|search ["“''][^"”'']+["”''] in)'
      then true else false
    end self_promo,
    length(coalesce(ri.body,'')) as body_len
  from public.signals s
  join public.raw_items ri on ri.id=s.raw_item_id
  join public.sources src on src.id=s.source_id
  where src.key='hackernews'
    and s.evidence_role='problem_demand'
), rescored as (
  select *,
    case
      when direct_product then 8
      when service_spend then 6
      else 1
    end purchase,
    least(10,
      4
      + case when body_len>250 then 2 else 0 end
      + case when direct_product then 2 else 0 end
      + case when service_spend then 1 else 0 end
      + case when comments>=3 then 1 else 0 end
      + case when comments>=10 then 1 else 0 end
    ) evidence,
    (
      explicit_problem
      or direct_product
      or txt ~ '(what do you miss|what is missing|what are you missing|which (tool|service|app)|any (good )?(tool|service|alternative)|recommend(ation|ations)? for|looking for|alternative to|current options are|too tedious|manual(ly)? review|hours of time|keeps? (failing|breaking)|cannot|can''t|doesn''t|does not|annoying|frustrating|pain point|undefendable|fraud risk|missing feature|there is always .* missing)'
    ) hn_demand
  from classified
), final as (
  select *,
    least(10,greatest(1,round(pain_score*0.45 + purchase*0.35 + evidence*0.20)::integer)) relevance
  from rescored
)
update public.signals s
set evidence_role=case when f.self_promo then 'launch_competitor' else 'problem_demand' end,
    purchase_intent_score=case when f.self_promo then 1 else f.purchase end,
    money_signal_type=case
      when f.self_promo then 'none'
      when f.service_spend then 'job_post'
      when f.direct_product then 'purchase_request'
      else 'none'
    end,
    evidence_quality_score=f.evidence,
    relevance_score=f.relevance,
    is_actionable=(not f.self_promo and f.hn_demand and f.relevance>=4),
    extraction_version='hn-role-backfill-v1.4.2'
from final f
where s.id=f.id;

delete from public.cluster_signals cs
using public.signals s, public.sources src
where cs.signal_id=s.id
  and s.source_id=src.id
  and src.key='hackernews'
  and s.evidence_role<>'problem_demand'
  and cs.assignment_method='semantic-v1.1';

select public.radar_refresh_evidence_metrics();
