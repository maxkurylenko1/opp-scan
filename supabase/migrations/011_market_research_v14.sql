alter table public.opportunity_themes
  add column if not exists market_researched_at timestamptz,
  add column if not exists market_summary text,
  add column if not exists market_research_version text,
  add column if not exists market_competitor_count integer not null default 0,
  add column if not exists market_pricing_evidence_count integer not null default 0,
  add column if not exists market_gap_score numeric(4,2),
  add column if not exists market_pricing_hypothesis text,
  add column if not exists market_biggest_risk text;

alter table public.competitors
  add column if not exists research_version text not null default 'manual',
  add column if not exists research_run_at timestamptz;

create index if not exists competitors_research_version_idx
  on public.competitors(opportunity_id, research_version);

create or replace function public.enrich_signal_money_from_raw()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  payload jsonb;
  amount_text text;
  currency_text text;
begin
  if new.raw_item_id is null then return new; end if;
  if new.money_amount is not null and new.money_currency is not null then return new; end if;

  select raw_payload into payload from public.raw_items where id=new.raw_item_id;
  amount_text := nullif(payload->>'amount','');
  currency_text := nullif(payload->>'currency','');

  if new.money_amount is null and amount_text ~ '^[0-9]+([.][0-9]+)?$' then
    new.money_amount := amount_text::numeric;
  end if;
  if new.money_currency is null and currency_text is not null then
    new.money_currency := left(upper(currency_text),3);
  end if;
  return new;
end;
$$;

drop trigger if exists signals_enrich_money_from_raw on public.signals;
create trigger signals_enrich_money_from_raw
before insert or update on public.signals
for each row execute function public.enrich_signal_money_from_raw();

update public.signals s
set money_amount=(ri.raw_payload->>'amount')::numeric,
    money_currency=coalesce(nullif(s.money_currency,''),left(upper(coalesce(ri.raw_payload->>'currency','USD')),3))
from public.raw_items ri
join public.sources src on src.id=ri.source_id
where s.raw_item_id=ri.id
  and src.key='algora'
  and s.money_amount is null
  and (ri.raw_payload->>'amount') ~ '^[0-9]+([.][0-9]+)?$';
