-- V2.8: ranking hygiene and legacy GitHub recalibration.
-- Current rankings must be driven only by actionable problem/spend evidence.

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
      v_actionable, v_evidence_role, 'sql-heuristic-v1.7'
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
    values (v_cluster_id,v_signal_id,'sql-heuristic-v1.7')
    on conflict (cluster_id,signal_id) do nothing;

    update public.raw_items set processed_at=now() where id=r.id;
    v_processed:=v_processed+1;
  end loop;
  return v_processed;
end;
$function$
;

revoke execute on function public.radar_process_pending(integer) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.match_problem_clusters(query_embedding vector, match_threshold double precision DEFAULT 0.78, match_count integer DEFAULT 8, version_filter text DEFAULT 'semantic-v1.2'::text)
 RETURNS TABLE(id uuid, slug text, name text, category text, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    pc.id,
    pc.slug,
    pc.name,
    pc.category,
    1 - (pc.embedding <=> query_embedding) as similarity
  from public.problem_clusters pc
  where pc.embedding is not null
    and pc.status <> 'killed'
    and pc.clustering_version = version_filter
    and 1 - (pc.embedding <=> query_embedding) >= match_threshold
  order by pc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$function$
;

revoke execute on function public.match_problem_clusters(extensions.vector,double precision,integer,text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.refresh_opportunity_themes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_count integer := 0;
begin
  create temporary table if not exists tmp_theme_edges (
    a uuid,
    b uuid,
    similarity numeric
  ) on commit drop;
  truncate tmp_theme_edges;

  insert into tmp_theme_edges(a,b,similarity)
  with cp as (
    select pc.id,pc.name,pc.category,pc.embedding,
           array_agg(distinct src.kind order by src.kind) as platforms
    from public.problem_clusters pc
    join public.cluster_signals cs on cs.cluster_id=pc.id and cs.assignment_method='semantic-v1.2'
    join public.signals s on s.id=cs.signal_id
    join public.sources src on src.id=s.source_id
    where pc.clustering_version='semantic-v1.2'
      and pc.embedding is not null
      and pc.status <> 'killed'
      and s.is_actionable
      and s.evidence_role in ('problem_demand','service_spend')
    group by pc.id,pc.name,pc.category,pc.embedding
  ), pairs as (
    select a.id a,b.id b,a.name a_name,b.name b_name,a.category,
           a.platforms a_platforms,b.platforms b_platforms,
           (1-(a.embedding <=> b.embedding))::numeric as sim
    from cp a
    join cp b on a.id < b.id and a.category=b.category
  )
  select a,b,sim
  from pairs
  where
    sim >= 0.90
    or (
      sim >= 0.76
      and public.theme_tokens(a_name) && public.theme_tokens(b_name)
    )
    or (
      not (a_platforms && b_platforms)
      and sim >= 0.64
      and public.theme_tokens(a_name) && public.theme_tokens(b_name)
    );

  create temporary table if not exists tmp_theme_components (
    cluster_id uuid,
    root_id uuid
  ) on commit drop;
  truncate tmp_theme_components;

  insert into tmp_theme_components(cluster_id,root_id)
  with recursive vertices as (
    select a id from tmp_theme_edges
    union
    select b id from tmp_theme_edges
  ), reach(start_id,node_id) as (
    select id,id from vertices
    union
    select r.start_id, case when e.a=r.node_id then e.b else e.a end
    from reach r
    join tmp_theme_edges e on e.a=r.node_id or e.b=r.node_id
  )
  select node_id,min(start_id::text)::uuid from reach group by node_id;

  create temporary table if not exists tmp_theme_defs (
    slug text primary key,
    name text,
    summary text,
    category text,
    embedding extensions.vector(1536),
    first_seen_at timestamptz,
    last_seen_at timestamptz,
    root_id uuid
  ) on commit drop;
  truncate tmp_theme_defs;

  insert into tmp_theme_defs(slug,name,summary,category,embedding,first_seen_at,last_seen_at,root_id)
  with component_stats as (
    select tc.root_id,
           count(*) as cluster_count,
           min(pc.first_seen_at) as first_seen_at,
           max(pc.last_seen_at) as last_seen_at
    from tmp_theme_components tc
    join public.problem_clusters pc on pc.id=tc.cluster_id
    group by tc.root_id
    having count(*) >= 2
  ), anchor as (
    select distinct on (tc.root_id)
           tc.root_id,pc.id,pc.name,pc.summary,pc.category,pc.embedding,
           coalesce(cm.signal_count,0) signal_count,
           coalesce(cm.money_signal_count,0) money_signal_count
    from tmp_theme_components tc
    join component_stats st on st.root_id=tc.root_id
    join public.problem_clusters pc on pc.id=tc.cluster_id
    left join lateral (
      select count(distinct s.id)::int signal_count,
             count(distinct s.id) filter(where s.money_signal_type is not null and s.money_signal_type<>'none')::int money_signal_count
      from public.cluster_signals cs
      join public.signals s on s.id=cs.signal_id
      where cs.cluster_id=pc.id and cs.assignment_method='semantic-v1.2'
    ) cm on true
    order by tc.root_id,(coalesce(cm.money_signal_count,0)*3 + coalesce(cm.signal_count,0)) desc,pc.name
  )
  select
    'theme-' || st.root_id::text,
    a.name,
    format('Repeated opportunity theme spanning %s exact problem clusters.',st.cluster_count),
    a.category,
    a.embedding,
    st.first_seen_at,
    st.last_seen_at,
    st.root_id
  from component_stats st
  join anchor a on a.root_id=st.root_id;

  insert into public.opportunity_themes(
    slug,name,summary,category,status,embedding,theme_version,first_seen_at,last_seen_at,updated_at
  )
  select slug,name,summary,category,'watching',embedding,'theme-v1.0',first_seen_at,last_seen_at,now()
  from tmp_theme_defs
  on conflict(slug) do update set
    name=excluded.name,
    summary=excluded.summary,
    category=excluded.category,
    embedding=excluded.embedding,
    theme_version='theme-v1.0',
    first_seen_at=least(coalesce(public.opportunity_themes.first_seen_at,excluded.first_seen_at),excluded.first_seen_at),
    last_seen_at=greatest(coalesce(public.opportunity_themes.last_seen_at,excluded.last_seen_at),excluded.last_seen_at),
    status=case when public.opportunity_themes.status='killed' then 'killed' else 'watching' end,
    updated_at=now();

  update public.opportunity_themes ot
  set status='killed',updated_at=now()
  where ot.theme_version='theme-v1.0'
    and not exists(select 1 from tmp_theme_defs d where d.slug=ot.slug);

  delete from public.theme_clusters tc
  using public.opportunity_themes ot
  where tc.theme_id=ot.id and ot.theme_version='theme-v1.0';

  delete from public.theme_metrics tm
  using public.opportunity_themes ot
  where tm.theme_id=ot.id and ot.theme_version='theme-v1.0';

  insert into public.theme_clusters(theme_id,cluster_id,similarity,assignment_method)
  select ot.id,tc.cluster_id,
         greatest(0,least(1,(1-(pc.embedding <=> ot.embedding))::numeric)),
         'theme-v1.0'
  from tmp_theme_components tc
  join tmp_theme_defs d on d.root_id=tc.root_id
  join public.opportunity_themes ot on ot.slug=d.slug and ot.theme_version='theme-v1.0'
  join public.problem_clusters pc on pc.id=tc.cluster_id;

  insert into public.theme_metrics(
    theme_id,exact_cluster_count,signal_count,independent_source_count,money_signal_count,
    unique_author_count,avg_pain,avg_purchase_intent,avg_evidence_quality,recent_signal_count,updated_at
  )
  select
    ot.id,
    count(distinct tc.cluster_id)::int,
    count(distinct s.id)::int,
    count(distinct src.kind)::int,
    count(distinct s.id) filter(where s.money_signal_type is not null and s.money_signal_type<>'none')::int,
    count(distinct nullif(ri.author,''))::int,
    coalesce(avg(s.pain_score),0),
    coalesce(avg(s.purchase_intent_score),0),
    coalesce(avg(s.evidence_quality_score),0),
    count(distinct s.id) filter(where s.published_at>=now()-interval '7 days')::int,
    now()
  from public.opportunity_themes ot
  join public.theme_clusters tc on tc.theme_id=ot.id and tc.assignment_method='theme-v1.0'
  join public.cluster_signals cs on cs.cluster_id=tc.cluster_id and cs.assignment_method='semantic-v1.2'
  join public.signals s on s.id=cs.signal_id
  join public.sources src on src.id=s.source_id
  left join public.raw_items ri on ri.id=s.raw_item_id
  where ot.theme_version='theme-v1.0' and ot.status<>'killed'
    and s.is_actionable
    and s.evidence_role in ('problem_demand','service_spend')
  group by ot.id;

  update public.opportunities o
  set status='watching',updated_at=now()
  where o.theme_id in (
    select id from public.opportunity_themes where theme_version='theme-v1.0' and status='killed'
  ) and o.status in ('research','validate');

  select count(*) into v_count from public.opportunity_themes where theme_version='theme-v1.0' and status<>'killed';
  return v_count;
end;
$function$
;

revoke execute on function public.refresh_opportunity_themes() from public,anon,authenticated;

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

CREATE OR REPLACE FUNCTION public.radar_snapshot_scan(p_scan_id uuid, p_limit integer DEFAULT 5)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count integer;
begin
  delete from public.radar_scan_opportunities where scan_id=p_scan_id;

  with active as (
    select o.* from public.opportunities o
    where o.status in ('watching','research','validate','build','winner')
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
$function$
;

revoke execute on function public.radar_snapshot_scan(uuid,integer) from public,anon,authenticated;

-- Re-normalize versioned source data whose raw collection is trustworthy but whose
-- signal extraction predates the current source-specific gates.
update public.raw_items ri
set processed_at=null
from public.sources src
where ri.source_id=src.id
  and (
    src.key='stackoverflow'
    or (
      src.key='github'
      and coalesce(ri.raw_payload->>'collector','')='github-demand-v1.3'
    )
  );

select public.radar_process_pending(1000);

-- Unversioned GitHub collection predates the demand-focused collector and cannot
-- satisfy the current evidence contract. Preserve it as history, but quarantine it.
update public.signals s
set is_actionable=false,
    extraction_version='legacy-github-quarantined-v2.8'
from public.raw_items ri
join public.sources src on src.id=ri.source_id
where s.raw_item_id=ri.id
  and src.key='github'
  and coalesce(ri.raw_payload->>'collector','')='';

-- Reddit remains blocked pending approved API access. Old unversioned fallback rows
-- are preserved for audit/history but cannot contribute to ranking.
update public.signals s
set is_actionable=false,
    extraction_version='legacy-reddit-quarantined-v2.8'
from public.raw_items ri
join public.sources src on src.id=ri.source_id
where s.raw_item_id=ri.id
  and src.key='reddit'
  and coalesce(ri.raw_payload->>'collector','')='';

-- Links created by older models must not keep non-actionable/context evidence alive.
delete from public.cluster_signals cs
using public.signals s
where cs.signal_id=s.id
  and (
    not s.is_actionable
    or s.evidence_role not in ('problem_demand','service_spend')
  );

-- V1.1 clusters are historical after the precision threshold change.
update public.problem_clusters
set status='killed',updated_at=now()
where clustering_version='semantic-v1.1'
  and status<>'killed';

CREATE OR REPLACE FUNCTION public.refresh_semantic_cluster_metrics(metric_day date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  affected integer;
begin
  insert into public.cluster_metrics (
    cluster_id, metric_date, window_days, signal_count, independent_source_count,
    money_signal_count, unique_author_count, avg_pain, avg_purchase_intent,
    weighted_signal_strength, growth_pct
  )
  select
    pc.id,
    metric_day,
    7,
    count(distinct s.id)::int,
    count(distinct src.kind)::int,
    count(distinct s.id) filter (where s.money_signal_type <> 'none')::int,
    count(distinct nullif(ri.author, ''))::int,
    coalesce(avg(s.pain_score), 0)::numeric(5,2),
    coalesce(avg(s.purchase_intent_score), 0)::numeric(5,2),
    coalesce(sum(
      (s.pain_score * 0.35) +
      (s.purchase_intent_score * 0.30) +
      (s.evidence_quality_score * 0.20) +
      (s.urgency_score * 0.15)
    ), 0)::numeric(7,3),
    case
      when prev.signal_count is null or prev.signal_count = 0 then null
      else round(((count(distinct s.id)::numeric - prev.signal_count) / prev.signal_count) * 100, 2)
    end
  from public.problem_clusters pc
  join public.cluster_signals cs on cs.cluster_id = pc.id and cs.assignment_method = 'semantic-v1.2'
  join public.signals s on s.id = cs.signal_id
  join public.sources src on src.id = s.source_id
  left join public.raw_items ri on ri.id = s.raw_item_id
  left join lateral (
    select cm.signal_count
    from public.cluster_metrics cm
    where cm.cluster_id = pc.id
      and cm.metric_date < metric_day
      and cm.window_days = 7
    order by cm.metric_date desc
    limit 1
  ) prev on true
  where pc.clustering_version = 'semantic-v1.2'
    and s.published_at >= (metric_day::timestamptz - interval '7 days')
    and s.published_at < ((metric_day + 1)::timestamptz)
  group by pc.id, prev.signal_count
  on conflict (cluster_id, metric_date, window_days)
  do update set
    signal_count = excluded.signal_count,
    independent_source_count = excluded.independent_source_count,
    money_signal_count = excluded.money_signal_count,
    unique_author_count = excluded.unique_author_count,
    avg_pain = excluded.avg_pain,
    avg_purchase_intent = excluded.avg_purchase_intent,
    weighted_signal_strength = excluded.weighted_signal_strength,
    growth_pct = excluded.growth_pct;

  get diagnostics affected = row_count;
  return affected;
end;
$function$
;

revoke execute on function public.refresh_semantic_cluster_metrics(date) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.radar_refresh_evidence_metrics()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      coalesce(s.evidence_role,'problem_demand') as evidence_role,
      lower(concat_ws(' ',ri.title,ri.body,s.problem,s.evidence_excerpt)) as txt,
      case
        when coalesce(s.evidence_role,'problem_demand')='launch_competitor' then true
        when src.kind <> 'marketplace'
         and lower(concat_ws(' ',ri.title,ri.body,s.problem)) ~
           '(\\bi built\\b|\\bi made\\b|\\bwe built\\b|\\bwe made\\b|\\bwe launched\\b|\\blaunching my\\b|\\bmy saas\\b|\\bmy app\\b|\\bshow hn\\b|\\bintroducing our\\b)'
        then true else false
      end as self_promo,
      case
        when coalesce(s.evidence_role,'problem_demand')='service_spend' then true
        when src.kind = 'marketplace' then true
        when s.money_signal_type in ('job_post','bounty') then true
        else false
      end as service_spend,
      case
        when coalesce(s.evidence_role,'problem_demand')='problem_demand'
         and src.kind <> 'marketplace'
         and lower(concat_ws(' ',ri.title,ri.body,s.problem,s.evidence_excerpt)) ~
           '(would pay|willing to pay|pay for (a|an|this|something)|looking for (a|an|some) (tool|app|service|alternative)|need (a|an) (tool|app|service)|any (tool|app|service).*(for|that)|subscription.*(need|worth|looking))'
         and not (
           lower(concat_ws(' ',ri.title,ri.body,s.problem)) ~
           '(\\bi built\\b|\\bi made\\b|\\bwe built\\b|\\bwe launched\\b|\\bmy saas\\b|\\bmy app\\b|\\bshow hn\\b)'
         )
        then true else false
      end as direct_product_purchase
    from public.opportunity_themes ot
    join public.theme_clusters tc on tc.theme_id=ot.id and tc.assignment_method='theme-v1.0'
    join public.cluster_signals cs on cs.cluster_id=tc.cluster_id and cs.assignment_method='semantic-v1.2'
    join public.signals s on s.id=cs.signal_id
    join public.sources src on src.id=s.source_id
    left join public.raw_items ri on ri.id=s.raw_item_id
    where ot.theme_version='theme-v1.0' and ot.status<>'killed'
  ), agg as (
    select
      theme_id,
      count(distinct source_key) filter(where evidence_role in ('problem_demand','service_spend'))::int as source_keys,
      count(distinct coalesce(raw_item_id::text,signal_id::text))
        filter(where evidence_role in ('problem_demand','service_spend'))::int as evidence_units,
      count(distinct signal_id)
        filter(where evidence_role='problem_demand' and not self_promo)::int as organic_problem,
      count(distinct signal_id) filter(where service_spend)::int as service_spend,
      count(distinct signal_id) filter(where direct_product_purchase)::int as direct_purchase,
      count(distinct signal_id) filter(where self_promo)::int as self_promo,
      count(distinct signal_id) filter(where evidence_role='launch_competitor')::int as launches,
      count(distinct signal_id) filter(where evidence_role='market_context')::int as market_context,
      count(distinct coalesce(raw_item_id::text,signal_id::text))
        filter(where published_at>=now()-interval '7 days' and evidence_role in ('problem_demand','service_spend'))::int as recent_units
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
      launch_competitor_signal_count=coalesce(a.launches,0),
      market_context_signal_count=coalesce(a.market_context,0),
      recent_evidence_unit_count=coalesce(a.recent_units,0),
      updated_at=now()
  from agg a
  where tm.theme_id=a.theme_id;

  get diagnostics v_count=row_count;
  return v_count;
end;
$function$
;

revoke execute on function public.radar_refresh_evidence_metrics() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.radar_weekly_rank()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  select exists(select 1 from public.cluster_signals where assignment_method='semantic-v1.2') into v_has_semantic;

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
        and ((v_has_semantic and pc.clustering_version='semantic-v1.2' and cs.assignment_method='semantic-v1.2')
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
$function$
;

revoke execute on function public.radar_weekly_rank() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.radar_theme_rank()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_opp_id uuid;
  v_count integer := 0;
  v_top uuid[] := '{}';
  v_watch uuid[] := '{}';
  v_week_start date := (current_date - ((extract(isodow from current_date)::int)-1));
  v_week_end date := v_week_start + 6;
begin
  update public.opportunities
  set status='watching',
      decision_tier='scout',
      score_version=case when score_version='theme-v2.1' then 'theme-v2.1-retired' else score_version end,
      updated_at=now()
  where theme_id is not null
    and status in ('watching','research','validate')
    and status not in ('build','winner');

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
      case when r.decision='validate' then 'validate' when r.decision='research' then 'research' else 'watching' end,
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
$function$
;

revoke execute on function public.radar_theme_rank() from public,anon,authenticated;

-- Rebuild the subset that already has embeddings so V1.2 can be verified immediately.
-- Signals without embeddings are picked up by the normal Vercel recluster job.
create or replace function public.radar_recluster_existing_embeddings_v12()
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $recluster$
declare
  r record;
  v_cluster_id uuid;
  v_similarity double precision;
  v_created integer:=0;
  v_assigned integer:=0;
  v_skipped integer:=0;
begin
  delete from public.cluster_signals where assignment_method='semantic-v1.2';
  delete from public.problem_clusters
  where clustering_version='semantic-v1.2'
    and not exists (
      select 1 from public.opportunities o
      where o.cluster_id=problem_clusters.id and o.status in ('build','winner')
    );

  for r in
    select
      s.id,s.published_at,s.persona,s.category,s.problem,s.embedding,
      s.evidence_quality_score,
      src.key source_key,src.kind source_kind
    from public.signals s
    join public.sources src on src.id=s.source_id
    where s.is_actionable
      and s.evidence_role in ('problem_demand','service_spend')
      and s.embedding is not null
    order by s.evidence_quality_score desc,s.published_at desc,s.id
  loop
    v_cluster_id:=null;
    v_similarity:=null;

    select pc.id,(1-(pc.embedding <=> r.embedding))::double precision
    into v_cluster_id,v_similarity
    from public.problem_clusters pc
    where pc.clustering_version='semantic-v1.2'
      and pc.status<>'killed'
      and pc.embedding is not null
      and (
        (
          r.source_kind='marketplace'
          and (
            (1-(pc.embedding <=> r.embedding)) >= 0.86
            or (
              pc.category=r.category
              and (1-(pc.embedding <=> r.embedding)) >= 0.78
              and public.theme_tokens(pc.name) && public.theme_tokens(r.problem)
            )
          )
        )
        or
        (
          r.source_kind<>'marketplace'
          and (
            (1-(pc.embedding <=> r.embedding)) >= 0.82
            or (
              pc.category=r.category
              and (1-(pc.embedding <=> r.embedding)) >= 0.72
              and public.theme_tokens(pc.name) && public.theme_tokens(r.problem)
            )
          )
        )
      )
    order by pc.embedding <=> r.embedding
    limit 1;

    if v_cluster_id is null then
      if r.source_key='algora' then
        v_skipped:=v_skipped+1;
        continue;
      end if;

      insert into public.problem_clusters(
        slug,name,summary,target_customer,category,status,
        first_seen_at,last_seen_at,embedding,clustering_version
      ) values (
        'semantic-v12-'||r.id::text,
        left(r.problem,180),
        r.problem,
        coalesce(r.persona,'Unknown'),
        coalesce(r.category,'other'),
        'watching',
        coalesce(r.published_at,now()),
        coalesce(r.published_at,now()),
        r.embedding,
        'semantic-v1.2'
      )
      returning id into v_cluster_id;
      v_similarity:=1;
      v_created:=v_created+1;
    else
      update public.problem_clusters
      set last_seen_at=greatest(last_seen_at,coalesce(r.published_at,now())),
          updated_at=now()
      where id=v_cluster_id;
    end if;

    insert into public.cluster_signals(cluster_id,signal_id,similarity,assignment_method)
    values(v_cluster_id,r.id,v_similarity,'semantic-v1.2')
    on conflict(cluster_id,signal_id) do update
      set similarity=excluded.similarity,assignment_method=excluded.assignment_method;
    v_assigned:=v_assigned+1;
  end loop;

  perform public.refresh_semantic_cluster_metrics();

  return jsonb_build_object(
    'created',v_created,
    'assigned',v_assigned,
    'skipped',v_skipped
  );
end;
$recluster$;

revoke execute on function public.radar_recluster_existing_embeddings_v12() from public,anon,authenticated;

select public.radar_recluster_existing_embeddings_v12();
select public.radar_refresh_and_rank();
