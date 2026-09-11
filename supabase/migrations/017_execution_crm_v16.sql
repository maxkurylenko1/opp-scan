alter table public.experiments
  add column if not exists success_paid_count integer not null default 3,
  add column if not exists success_delivered_count integer not null default 2,
  add column if not exists failure_contact_limit integer,
  add column if not exists failure_paid_below_count integer not null default 2,
  add column if not exists execution_state text not null default 'not_started';

create table if not exists public.validation_contacts (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  name text, handle text, company text, source_kind text, source_url text,
  stage text not null default 'prospect' check(stage in ('prospect','contacted','replied','qualified','paid','delivered','lost')),
  amount_paid numeric(12,2) not null default 0 check(amount_paid >= 0),
  currency varchar(3), notes text,
  contacted_at timestamptz, replied_at timestamptz, qualified_at timestamptz,
  paid_at timestamptz, delivered_at timestamptz, lost_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.validation_events (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  contact_id uuid references public.validation_contacts(id) on delete cascade,
  event_type text not null, from_stage text, to_stage text,
  amount numeric(12,2), currency varchar(3), note text,
  occurred_at timestamptz not null default now(), created_at timestamptz not null default now()
);

alter table public.validation_contacts enable row level security;
alter table public.validation_events enable row level security;
create index if not exists validation_contacts_experiment_stage_idx on public.validation_contacts(experiment_id,stage);
create index if not exists validation_events_experiment_occurred_idx on public.validation_events(experiment_id,occurred_at desc);

-- Production also defines validation_stage_rank(), refresh_experiment_execution(),
-- validation_contact_before_write(), validation_contact_after_write() and triggers.
-- Keep EXECUTE on mutation/decision SECURITY DEFINER functions revoked from public/anon/authenticated.
