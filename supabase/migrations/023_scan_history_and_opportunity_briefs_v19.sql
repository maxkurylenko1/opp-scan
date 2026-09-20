-- V1.9: dated scan history, immutable opportunity snapshots and concrete build briefs.
create table if not exists public.opportunity_briefs (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  brief_version text not null default 'build-brief-v1.9',
  input_hash text not null,
  readiness text not null check (readiness in ('research_only','validate_first','build_candidate')),
  product_type text,
  build_summary text not null,
  primary_user text,
  core_job text,
  why_it_can_work text,
  evidence_basis text,
  mvp_features jsonb not null default '[]'::jsonb,
  user_flow jsonb not null default '[]'::jsonb,
  non_goals jsonb not null default '[]'::jsonb,
  technical_approach text,
  risks jsonb not null default '[]'::jsonb,
  unknowns jsonb not null default '[]'::jsonb,
  build_days_min integer,
  build_days_max integer,
  validation_days integer,
  first_milestone text,
  success_definition text,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.opportunity_briefs enable row level security;
create index if not exists opportunity_briefs_readiness_idx on public.opportunity_briefs(readiness,generated_at desc);

create table if not exists public.radar_scans (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null default 'manual' check (trigger_type in ('manual','scheduled')),
  status text not null default 'running' check (status in ('running','success','partial','failed')),
  scan_date date not null default current_date,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  new_raw_items integer not null default 0,
  new_signals integer not null default 0,
  new_actionable integer not null default 0,
  source_runs integer not null default 0,
  source_failures integer not null default 0,
  opportunities_snapshot_count integer not null default 0,
  error_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.radar_scans enable row level security;
create index if not exists radar_scans_started_at_idx on public.radar_scans(started_at desc);
create unique index if not exists radar_scans_scheduled_date_uidx on public.radar_scans(scan_date) where trigger_type='scheduled';

alter table public.collection_runs add column if not exists scan_id uuid references public.radar_scans(id) on delete set null;
create index if not exists collection_runs_scan_id_idx on public.collection_runs(scan_id);

create table if not exists public.radar_scan_opportunities (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.radar_scans(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  rank integer not null,
  title text not null,
  origin text not null,
  status text not null,
  opportunity_score numeric(6,2) not null,
  confidence_score numeric(6,2) not null,
  thesis text,
  target_customer text,
  why_now text,
  mvp_scope text,
  biggest_risk text,
  pricing_hypothesis text,
  time_to_validation_days integer,
  brief jsonb,
  created_at timestamptz not null default now(),
  unique(scan_id,rank),
  unique(scan_id,opportunity_id)
);
alter table public.radar_scan_opportunities enable row level security;
create index if not exists radar_scan_opportunities_scan_rank_idx on public.radar_scan_opportunities(scan_id,rank);

create or replace function public.radar_snapshot_scan(p_scan_id uuid,p_limit integer default 10)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  delete from public.radar_scan_opportunities where scan_id=p_scan_id;
  insert into public.radar_scan_opportunities(scan_id,opportunity_id,rank,title,origin,status,opportunity_score,confidence_score,thesis,target_customer,why_now,mvp_scope,biggest_risk,pricing_hypothesis,time_to_validation_days,brief)
  select p_scan_id,o.id,row_number() over(order by o.opportunity_score desc,o.confidence_score desc,o.id)::integer,o.title,
    case when o.theme_id is not null then 'theme' else 'exact' end,o.status,o.opportunity_score,o.confidence_score,o.thesis,o.target_customer,o.why_now,o.mvp_scope,o.biggest_risk,o.pricing_hypothesis,o.time_to_validation_days,
    case when b.id is null then null else (to_jsonb(b)-'id'-'opportunity_id') end
  from public.opportunities o left join public.opportunity_briefs b on b.opportunity_id=o.id
  where o.status in ('research','validate','build','winner')
  order by o.opportunity_score desc,o.confidence_score desc,o.id
  limit greatest(1,least(coalesce(p_limit,10),25));
  get diagnostics v_count=row_count;
  update public.radar_scans set opportunities_snapshot_count=v_count where id=p_scan_id;
  return v_count;
end $$;
revoke all on function public.radar_snapshot_scan(uuid,integer) from public,anon,authenticated;

create or replace function public.radar_finalize_scheduled_scan(p_date date default current_date)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_scan_id uuid; v_start timestamptz:=(p_date::timestamp at time zone 'UTC'); v_end timestamptz:=((p_date+1)::timestamp at time zone 'UTC');
  v_runs integer:=0; v_failures integer:=0; v_inserted integer:=0; v_started timestamptz; v_finished timestamptz;
begin
  select id into v_scan_id from public.radar_scans where trigger_type='scheduled' and scan_date=p_date limit 1;
  if v_scan_id is null then
    insert into public.radar_scans(trigger_type,status,scan_date,started_at,metadata)
    values('scheduled','running',p_date,v_start,jsonb_build_object('grouped_from_collection_runs',true)) returning id into v_scan_id;
  end if;
  update public.collection_runs set scan_id=v_scan_id where scan_id is null and started_at>=v_start and started_at<v_end;
  select count(*)::integer,count(*) filter(where status='failed')::integer,coalesce(sum(records_inserted),0)::integer,min(started_at),max(coalesce(finished_at,started_at))
    into v_runs,v_failures,v_inserted,v_started,v_finished from public.collection_runs where scan_id=v_scan_id;
  update public.radar_scans set
    status=case when v_runs=0 then 'failed' when v_failures>0 then 'partial' else 'success' end,
    started_at=coalesce(v_started,started_at),finished_at=coalesce(v_finished,now()),new_raw_items=v_inserted,
    new_signals=(select count(*)::integer from public.signals where created_at>=v_start and created_at<v_end),
    new_actionable=(select count(*)::integer from public.signals where created_at>=v_start and created_at<v_end and is_actionable),
    source_runs=v_runs,source_failures=v_failures
  where id=v_scan_id;
  if p_date=current_date then perform public.radar_snapshot_scan(v_scan_id,10); end if;
  return v_scan_id;
end $$;
revoke all on function public.radar_finalize_scheduled_scan(date) from public,anon,authenticated;

do $$
declare d date; sid uuid;
begin
  for d in select distinct started_at::date from public.collection_runs where scan_id is null and started_at>=current_date-14 order by 1 loop
    select id into sid from public.radar_scans where trigger_type='scheduled' and scan_date=d limit 1;
    if sid is null then
      insert into public.radar_scans(trigger_type,status,scan_date,started_at,metadata)
      values('scheduled','running',d,(d::timestamp at time zone 'UTC'),jsonb_build_object('historical_backfill',true)) returning id into sid;
    end if;
    update public.collection_runs set scan_id=sid where scan_id is null and started_at>=(d::timestamp at time zone 'UTC') and started_at<((d+1)::timestamp at time zone 'UTC');
    update public.radar_scans s set status=case when x.runs=0 then 'failed' when x.failures>0 then 'partial' else 'success' end,
      started_at=coalesce(x.started,s.started_at),finished_at=coalesce(x.finished,s.finished_at),new_raw_items=x.inserted,source_runs=x.runs,source_failures=x.failures,
      metadata=s.metadata||jsonb_build_object('historical_backfill',true)
    from (select count(*)::integer runs,count(*) filter(where status='failed')::integer failures,coalesce(sum(records_inserted),0)::integer inserted,min(started_at) started,max(coalesce(finished_at,started_at)) finished from public.collection_runs where scan_id=sid) x
    where s.id=sid;
  end loop;
end $$;

do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname='radar-scan-snapshot-daily' limit 1;
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule('radar-scan-snapshot-daily','45 5 * * *','select public.radar_finalize_scheduled_scan(current_date);');
end $$;
