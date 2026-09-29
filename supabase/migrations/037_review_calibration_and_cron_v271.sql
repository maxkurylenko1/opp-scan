-- V2.7.1: calibrate Firefox review evidence and schedule new source collectors.

with classified as (
  select
    ri.id raw_item_id,
    s.id signal_id,
    lower(coalesce(ri.body,'')) txt,
    case
      when lower(coalesce(ri.body,'')) ~
        '(missing|wish|need (a|an|to|way)|no way|without .* way|would be nice|feature|support for|option to|allow (me|us|users)|customi[sz]e|configure|manual|workflow|export|import|alternative|paywall|subscription|too expensive|privacy|permission)'
      then 'problem_demand'
      when lower(coalesce(ri.body,'')) ~
        '(doesn''t work|does not work|not working|broken|stopped working|slow|crash|freeze|unusable|bug|fails?|error|blank (screen|page)|login fails?|sign in fails?|sync .*error|lost|deleted)'
      then 'market_context'
      else null
    end evidence_role
  from public.raw_items ri
  join public.sources src on src.id=ri.source_id
  join public.signals s on s.raw_item_id=ri.id
  where src.key='amo_reviews'
)
update public.raw_items ri
set raw_payload = jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(ri.raw_payload,'{}'::jsonb),'{collector}','"amo-reviews-v1.1"'::jsonb,true),
      '{evidence_role}',to_jsonb(c.evidence_role),true
    ),
    '{review_role}',
    to_jsonb(case when c.evidence_role='problem_demand' then 'feature_or_workflow_gap' else 'product_failure' end),
    true
  )
from classified c
where ri.id=c.raw_item_id
  and c.evidence_role is not null;

with classified as (
  select
    s.id signal_id,
    case
      when lower(coalesce(ri.body,'')) ~
        '(missing|wish|need (a|an|to|way)|no way|without .* way|would be nice|feature|support for|option to|allow (me|us|users)|customi[sz]e|configure|manual|workflow|export|import|alternative|paywall|subscription|too expensive|privacy|permission)'
      then 'problem_demand'
      when lower(coalesce(ri.body,'')) ~
        '(doesn''t work|does not work|not working|broken|stopped working|slow|crash|freeze|unusable|bug|fails?|error|blank (screen|page)|login fails?|sign in fails?|sync .*error|lost|deleted)'
      then 'market_context'
      else null
    end evidence_role
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
    extraction_version='amo-review-calibration-v1.1'
from classified c
where s.id=c.signal_id
  and c.evidence_role is not null;

delete from public.cluster_signals cs
using public.signals s, public.sources src
where cs.signal_id=s.id
  and s.source_id=src.id
  and src.key='amo_reviews'
  and s.evidence_role='market_context';

-- Use the existing authenticated Edge Function cron command as a template without
-- committing the project key into source control.
do $$
declare template_command text;
begin
  select command into template_command
  from cron.job
  where jobname='radar-freelancer-daily'
  limit 1;

  if template_command is not null then
    perform cron.schedule(
      'radar-releases-daily',
      '4 5 * * *',
      replace(template_command,'radar-freelancer','radar-releases')
    );
    perform cron.schedule(
      'radar-amo-reviews-daily',
      '5 5 * * *',
      replace(template_command,'radar-freelancer','radar-amo-reviews')
    );
  end if;
end $$;

select public.radar_refresh_evidence_metrics();
