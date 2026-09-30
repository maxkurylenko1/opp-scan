-- V2.14: separate read-only research suggestions from official public external search.
-- No external result enters raw_items, signals, clusters, opportunities or money evidence.

alter table public.research_leads
  add column if not exists search_query text,
  add column if not exists last_external_search_at timestamptz,
  add column if not exists external_last_error text;
alter table public.research_leads
  add constraint research_leads_search_query_size
  check (search_query is null or length(search_query) <= 100);

update public.research_leads
set search_query = case source_url
  when 'https://news.ycombinator.com/item?id=49879648' then 'K1 tax form extraction'
  when 'https://news.ycombinator.com/item?id=49867620' then 'agent Drive file permission'
  when 'https://news.ycombinator.com/item?id=49904074' then 'Claude Codex context handoff'
  when 'https://news.ycombinator.com/item?id=49839721' then 'Stripe Link fraud'
  when 'https://addons.mozilla.org/firefox/addon/multi-account-containers/reviews/' then 'Firefox container account routing'
  when 'https://news.ycombinator.com/item?id=49896742' then 'garden photos editable 3D'
  else search_query
end
where origin='curated' and search_query is null;

create table if not exists public.research_external_refs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.research_leads(id) on delete cascade,
  provider text not null check(provider in ('hackernews','github')),
  source_url text not null,
  title text not null,
  source_published_at timestamptz,
  suggestion_type text not null check(suggestion_type in ('possible_report','possible_solution','github_issue')),
  search_query text not null,
  keyword_overlap smallint not null check(keyword_overlap>=2 and keyword_overlap<=10),
  review_status text not null default 'suggested'
    check(review_status in ('suggested','confirmed','dismissed')),
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(lead_id,source_url)
);
create index if not exists research_external_refs_lead_status
  on public.research_external_refs(lead_id,review_status,created_at desc);
alter table public.research_external_refs enable row level security;
revoke all on public.research_external_refs from public,anon,authenticated;
grant select,insert,update,delete on public.research_external_refs to service_role;

create table if not exists public.research_external_search_runs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.research_leads(id) on delete cascade,
  provider text not null check(provider in ('hackernews','github')),
  search_query text not null,
  status text not null check(status in ('success','rate_limited','error')),
  results_seen smallint not null default 0,
  suggestions_added smallint not null default 0,
  error_code text,
  created_at timestamptz not null default now()
);
create index if not exists research_external_search_runs_recent
  on public.research_external_search_runs(created_at desc);
alter table public.research_external_search_runs enable row level security;
revoke all on public.research_external_search_runs from public,anon,authenticated;
grant select,insert on public.research_external_search_runs to service_role;
