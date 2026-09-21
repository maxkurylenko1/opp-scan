-- V2.0.2: harden market helper and cover opportunity snapshot FK lookup.

alter function public.radar_signal_market(text,text,text) set search_path = public;

create index if not exists radar_scan_opportunities_opportunity_id_idx
  on public.radar_scan_opportunities(opportunity_id)
  where opportunity_id is not null;
