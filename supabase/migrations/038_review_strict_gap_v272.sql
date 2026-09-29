-- V2.7.2: require strong workflow/feature-gap language before an add-on review can count as problem demand.

with classified as (
  select
    ri.id as raw_item_id,
    s.id as signal_id,
    case
      when lower(coalesce(ri.body,'')) ~
        '(no way to|missing (feature|option|support|ability)|feature request|wish (it|this|there|i|we)|would be nice|support for|option to|allow (me|us|users) to|needs? (an? )?(option|feature|way|ability|support)|need to (be able|have|use|export|import|configure|customi[sz]e|choose|set|separate|manage|automate)|can(not|''t) .{0,50}(configure|customi[sz]e|export|import|choose|set|add .*exception|use separate|manage|automate)|have to .{0,60}manually|manually .{0,60}(every|each|again|repeat)|manual workflow|tedious|too many steps|looking for (an? )?alternative|too expensive|paywall)'
      then 'problem_demand'
      else 'market_context'
    end as evidence_role
  from public.raw_items ri
  join public.sources src on src.id=ri.source_id
  join public.signals s on s.raw_item_id=ri.id
  where src.key='amo_reviews'
)
update public.raw_items ri
set raw_payload = jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(ri.raw_payload,'{}'::jsonb),'{collector}','"amo-reviews-v1.2"'::jsonb,true),
      '{evidence_role}',to_jsonb(c.evidence_role),true
    ),
    '{review_role}',
    to_jsonb(case when c.evidence_role='problem_demand' then 'feature_or_workflow_gap' else 'product_failure_or_low_signal' end),
    true
  )
from classified c
where ri.id=c.raw_item_id;

with classified as (
  select
    s.id as signal_id,
    case
      when lower(coalesce(ri.body,'')) ~
        '(no way to|missing (feature|option|support|ability)|feature request|wish (it|this|there|i|we)|would be nice|support for|option to|allow (me|us|users) to|needs? (an? )?(option|feature|way|ability|support)|need to (be able|have|use|export|import|configure|customi[sz]e|choose|set|separate|manage|automate)|can(not|''t) .{0,50}(configure|customi[sz]e|export|import|choose|set|add .*exception|use separate|manage|automate)|have to .{0,60}manually|manually .{0,60}(every|each|again|repeat)|manual workflow|tedious|too many steps|looking for (an? )?alternative|too expensive|paywall)'
      then 'problem_demand'
      else 'market_context'
    end as evidence_role
  from public.signals s
  join public.raw_items ri on ri.id=s.raw_item_id
  join public.sources src on src.id=s.source_id
  where src.key='amo_reviews'
)
update public.signals s
set evidence_role=c.evidence_role,
    is_actionable=case when c.evidence_role='market_context' then false else s.is_actionable end,
    purchase_intent_score=case when c.evidence_role='market_context' then 1 else s.purchase_intent_score end,
    money_signal_type=case when c.evidence_role='market_context' then 'none' else s.money_signal_type end,
    extraction_version='amo-review-calibration-v1.2'
from classified c
where s.id=c.signal_id;

delete from public.cluster_signals cs
using public.signals s, public.sources src
where cs.signal_id=s.id
  and s.source_id=src.id
  and src.key='amo_reviews'
  and s.evidence_role='market_context';

select public.radar_refresh_evidence_metrics();
