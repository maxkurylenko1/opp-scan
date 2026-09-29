-- V2.8: Freelancer is service-spend evidence; only repeatable/productizable workflows may seed Scouts.

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
      v_actionable, v_evidence_role, 'sql-heuristic-v1.6'
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

    if v_evidence_role in ('launch_competitor','market_context')
       or (r.source_key='amo_reviews' and not v_actionable)
       or (r.source_key='freelancer' and not v_actionable) then
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
    values (v_cluster_id,v_signal_id,'sql-heuristic-v1.6')
    on conflict (cluster_id,signal_id) do nothing;

    update public.raw_items set processed_at=now() where id=r.id;
    v_processed:=v_processed+1;
  end loop;
  return v_processed;
end;
$function$;


revoke execute on function public.radar_process_pending(integer) from public,anon,authenticated;

with base as (
  select
    ri.id,
    lower(concat_ws(' ',ri.title,split_part(coalesce(ri.body,''),E'\nSkills:',1))) narrative
  from public.raw_items ri
  join public.sources src on src.id=ri.source_id
  where src.key='freelancer'
), features as (
  select
    id,
    narrative,
    narrative ~
      '(logo design|graphic design|video edit|video production|animation|3d model|3d animation|voice ?over|transcription|translation|proofread|article writing|academic|research paper|tutoring|lessons?|trainer|instructor|resume|curriculum vitae|story writer|creative writing|copywriter|email marketer|email marketing|sales closer|sales partner|sales representative|cold calling|affiliate marketing|social media campaign|seo services?|marketing freelancer|copy typing|virtual assistant|discord (server )?(builder|setup))'
      as generic_labor,
    narrative ~
      '(job description|we are seeking|we''re seeking|we are hiring|we''re hiring|hiring (a|an|freelance)|join (our|a) team|long[- ]term role|full[- ]time role|part[- ]time role|consultant role|commission[- ]based|commission only|independent contractor|sales agents?|generalist va|virtual assistant|take full ownership of .{0,40}workflow|(developer|specialist|expert|partner|assistant|consultant).{0,25}(required|needed))'
      as staffing_request,
    narrative ~
      '(siemens s7|(^|[^a-z])plc([^a-z]|$)|industrial automation line|motor control|firmware|embedded systems?|cobot|robotics hardware|weekly wordpress maintenance|wordpress maintenance|routine website maintenance)'
      as nonsoftware_or_maintenance,
    narrative ~
      '(automated .{0,40}(ad viewer|ad clicking)|stream .{0,40}(ads?|views?) every day|ticket[- ]buying bot|slot (picking|selection) automation|mass account creation|credential stuffing)'
      as abusive_automation,
    narrative ~
      '(manual process|manually .{0,70}(every|each|repeat|copy|enter|check|send|update)|recurring|repetitive|every (day|week|month)|routine workflows?|day[- ]to[- ]day .{0,50}(manual|work|process)|keep .{0,60} in sync|synchroni[sz]e|order confirmation|report generation|scheduled report|monitor(ing)? .{0,50}(changes|status|price|data|site)|business metrics|data across .{0,80}(dashboard|report))'
      as strong_operational_pain,
    narrative ~
      '((batch|multiple|dozens|hundreds|thousands|collection) .{0,80}(csv|pdf|document|file|record|image).{0,120}(convert|extract|transfer|process|clean|organize|merge|classify|copy|type))|((convert|extract|transfer|process|clean|organize|merge|classify).{0,120}(batch|multiple|dozens|hundreds|thousands|collection).{0,80}(csv|pdf|document|file|record|image))'
      as batch_transformation,
    narrative ~
      '((connect|integrat|sync).{0,100}(crm|sharepoint|google sheets|whatsapp|shopify|woocommerce|etsy|squarespace|payment|inventory|orders?|leads?).{0,120}(automat|workflow|sync|update|route|confirm|notify|report))|((orders?|inventory|leads?|customer data).{0,100}(sync|automat|route|confirm|update).{0,100}(crm|sharepoint|google sheets|whatsapp|shopify|woocommerce|api))'
      as operational_integration,
    narrative ~
      '(automate|automation|power automate|zapier|make\.com|n8n|workflow automation|ai workflow)'
      as automation_pain,
    narrative ~
      '(web scraping|data extraction|ocr|data mining).{0,120}(regular|recurring|daily|weekly|monthly|monitor|hundreds|thousands|multiple|list of|batch)'
      as data_collection_workflow,
    narrative ~
      '((build|develop|create|complete|commission).{0,50}(website|web app|mobile app|app([^a-z]|$)|platform|mvp|desktop app|browser extension|bot([^a-z]|$)|server([^a-z]|$)|system([^a-z]|$))|((website|web app|mobile app|platform|mvp|desktop app|browser extension|bot) (development|developer|build)))'
      as explicit_product_commission
  from base
), classified as (
  select
    id,
    case
      when not generic_labor
       and not staffing_request
       and not nonsoftware_or_maintenance
       and not abusive_automation
       and (
         case
           when explicit_product_commission then
             strong_operational_pain
             or batch_transformation
             or operational_integration
             or data_collection_workflow
           else
             strong_operational_pain
             or batch_transformation
             or operational_integration
             or data_collection_workflow
             or automation_pain
         end
       )
      then 'repeatable_workflow'
      when generic_labor or staffing_request or nonsoftware_or_maintenance or abusive_automation
      then 'generic_labor'
      else 'custom_build'
    end demand_class
  from features
)
update public.raw_items ri
set raw_payload =
  jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(ri.raw_payload,'{}'::jsonb),'{collector}','"freelancer-v1.3.4"'::jsonb,true),
      '{evidence_role}','"service_spend"'::jsonb,true
    ),
    '{demand_class}',to_jsonb(c.demand_class),true
  )
from classified c
where ri.id=c.id;

with classified as (
  select
    s.id signal_id,
    s.pain_score,
    lower(concat_ws(' ',ri.title,ri.body)) txt,
    coalesce(ri.raw_payload->>'demand_class','custom_build') demand_class,
    least(10,
      4
      + case when length(coalesce(ri.body,''))>250 then 2 else 0 end
      + 1
    ) evidence_quality
  from public.signals s
  join public.raw_items ri on ri.id=s.raw_item_id
  join public.sources src on src.id=s.source_id
  where src.key='freelancer'
), rescored as (
  select *,
    least(10,greatest(1,round(pain_score*0.45 + 6*0.35 + evidence_quality*0.20)::integer)) relevance
  from classified
)
update public.signals s
set evidence_role='service_spend',
    purchase_intent_score=6,
    money_signal_type='job_post',
    evidence_quality_score=r.evidence_quality,
    relevance_score=r.relevance,
    is_actionable=(r.demand_class='repeatable_workflow' and r.relevance>=4),
    extraction_version='freelancer-calibration-v1.3'
from rescored r
where s.id=r.signal_id;

-- Remove historical custom-build/labor links. They remain visible as spend context,
-- but only repeatable workflows may participate in problem clustering.
delete from public.cluster_signals cs
using public.signals s, public.sources src
where cs.signal_id=s.id
  and s.source_id=src.id
  and src.key='freelancer'
  and not s.is_actionable;

select public.refresh_semantic_cluster_metrics(current_date);
select public.radar_refresh_evidence_metrics();
select public.radar_refresh_and_rank();
