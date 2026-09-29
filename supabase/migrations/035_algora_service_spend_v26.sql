-- V2.6: Algora becomes low-frequency service-spend corroboration, not a primary problem source.

alter table public.signals drop constraint if exists signals_money_signal_type_check;
alter table public.signals add constraint signals_money_signal_type_check
  check (money_signal_type in ('none','budget','job_post','paid_workaround','purchase_request','existing_subscription','bounty'));

update public.signals s
set evidence_role='service_spend',
    money_signal_type='bounty',
    money_amount=nullif(ri.raw_payload->>'amount','')::numeric,
    money_currency=coalesce(nullif(ri.raw_payload->>'currency',''),'USD'),
    purchase_intent_score=case
      when coalesce(nullif(ri.raw_payload->>'amount','')::numeric,0)>=500 then 6
      when coalesce(nullif(ri.raw_payload->>'amount','')::numeric,0)>=100 then 5
      else 4
    end,
    evidence_quality_score=case
      when coalesce(nullif(ri.raw_payload->>'amount','')::numeric,0)>=100 then 5
      else 4
    end,
    is_actionable=coalesce(nullif(ri.raw_payload->>'amount','')::numeric,0)>=50,
    extraction_version='algora-service-v2.0'
from public.raw_items ri
join public.sources src on src.id=ri.source_id
where s.raw_item_id=ri.id
  and src.key='algora';

-- Existing Algora-only semantic clusters were created before source roles existed.
-- Remove those links; the next semantic pass may reattach active Algora bounties
-- only when they match an independently discovered problem cluster.
delete from public.cluster_signals cs
using public.signals s, public.sources src
where cs.signal_id=s.id
  and s.source_id=src.id
  and src.key='algora'
  and cs.assignment_method='semantic-v1.1';

-- Algora changed only once in the observed 21-run window, so daily polling adds noise/cost.
-- Keep it synchronized weekly before Monday's processing/ranking cycle.
select cron.alter_job(
  (select jobid from cron.job where jobname='radar-algora-daily' limit 1),
  '8 5 * * 1',
  null,
  null,
  null,
  null
);

select public.radar_refresh_evidence_metrics();
