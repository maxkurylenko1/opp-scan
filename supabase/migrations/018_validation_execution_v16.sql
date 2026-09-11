alter table public.experiments
  add column if not exists success_paid_count integer not null default 3,
  add column if not exists success_delivered_count integer not null default 2,
  add column if not exists failure_contact_limit integer,
  add column if not exists failure_paid_below_count integer not null default 2,
  add column if not exists execution_state text not null default 'not_started';

create table if not exists public.validation_contacts (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  name text,
  handle text,
  company text,
  source_kind text,
  source_url text,
  stage text not null default 'prospect' check (stage in ('prospect','contacted','replied','qualified','paid','delivered','lost')),
  amount_paid numeric not null default 0 check (amount_paid >= 0),
  currency varchar(3),
  notes text,
  contacted_at timestamptz,
  replied_at timestamptz,
  qualified_at timestamptz,
  paid_at timestamptz,
  delivered_at timestamptz,
  lost_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.validation_events (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  contact_id uuid references public.validation_contacts(id) on delete cascade,
  event_type text not null,
  from_stage text,
  to_stage text,
  amount numeric,
  currency varchar(3),
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.validation_contacts enable row level security;
alter table public.validation_events enable row level security;

create index if not exists validation_contacts_experiment_stage_idx on public.validation_contacts(experiment_id,stage);
create index if not exists validation_events_experiment_occurred_idx on public.validation_events(experiment_id,occurred_at desc);

create or replace function public.validation_stage_rank(p_stage text)
returns integer
language sql
immutable
set search_path=public
as $$
  select case p_stage
    when 'prospect' then 0 when 'contacted' then 1 when 'replied' then 2 when 'qualified' then 3
    when 'paid' then 4 when 'delivered' then 5 when 'lost' then 6 else -1 end;
$$;

create or replace function public.apply_experiment_verdict(p_experiment_id uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  e public.experiments%rowtype;
  o public.opportunities%rowtype;
  next_status text;
begin
  select * into e from public.experiments where id=p_experiment_id;
  if not found then raise exception 'experiment not found'; end if;
  if e.verdict not in ('pass','fail','inconclusive') then return 'pending'; end if;
  select * into o from public.opportunities where id=e.opportunity_id for update;
  if not found then raise exception 'opportunity not found'; end if;

  if e.verdict='pass' then
    next_status:=case when o.confidence_score>=70 and o.opportunity_score>=65 then 'build' else 'validate' end;
  elsif e.verdict='fail' then
    next_status:=case when exists(select 1 from public.experiments x where x.opportunity_id=o.id and x.verdict='fail' and x.id<>e.id) then 'killed' else 'research' end;
  else
    next_status:='research';
  end if;

  update public.opportunities set status=next_status,reviewed_at=now(),updated_at=now() where id=o.id;
  return next_status;
end;
$$;

create or replace function public.refresh_experiment_execution(p_experiment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  e public.experiments%rowtype;
  v_prospects int; v_contacted int; v_replied int; v_qualified int; v_paid int; v_delivered int; v_lost int;
  v_revenue numeric; v_new_verdict text;
begin
  select * into e from public.experiments where id=p_experiment_id for update;
  if not found then raise exception 'experiment not found'; end if;

  select count(*)::int,
    count(*) filter(where contacted_at is not null)::int,
    count(*) filter(where replied_at is not null)::int,
    count(*) filter(where qualified_at is not null)::int,
    count(*) filter(where paid_at is not null or amount_paid>0)::int,
    count(*) filter(where delivered_at is not null)::int,
    count(*) filter(where lost_at is not null or stage='lost')::int,
    coalesce(sum(amount_paid),0)
  into v_prospects,v_contacted,v_replied,v_qualified,v_paid,v_delivered,v_lost,v_revenue
  from public.validation_contacts where experiment_id=p_experiment_id;

  update public.experiments set
    execution_state=case when verdict in ('pass','fail') then 'completed' when v_contacted>0 then 'active' else 'not_started' end,
    started_at=case when v_contacted>0 then coalesce(started_at,now()) else started_at end,
    metric_value=v_paid,
    result_summary=format('%s prospects, %s contacted, %s replied, %s qualified, %s paid, %s delivered, %s lost; revenue %s.',v_prospects,v_contacted,v_replied,v_qualified,v_paid,v_delivered,v_lost,v_revenue)
  where id=p_experiment_id;

  if e.verdict='pending' then
    if v_paid>=coalesce(e.success_paid_count,3) and v_delivered>=coalesce(e.success_delivered_count,2) then
      v_new_verdict:='pass';
    elsif v_contacted>=coalesce(e.failure_contact_limit,e.target_sample_size,30) and v_paid<coalesce(e.failure_paid_below_count,2) then
      v_new_verdict:='fail';
    end if;
    if v_new_verdict is not null then
      update public.experiments set verdict=v_new_verdict,ended_at=now(),execution_state='completed' where id=p_experiment_id;
      perform public.apply_experiment_verdict(p_experiment_id);
    end if;
  end if;

  return jsonb_build_object('prospects',v_prospects,'contacted',v_contacted,'replied',v_replied,'qualified',v_qualified,'paid',v_paid,'delivered',v_delivered,'lost',v_lost,'revenue',v_revenue,'verdict',coalesce(v_new_verdict,e.verdict));
end;
$$;

create or replace function public.validation_contact_before_write()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.updated_at:=now();
  if new.stage in ('contacted','replied','qualified','paid','delivered') then new.contacted_at:=coalesce(new.contacted_at,now()); end if;
  if new.stage in ('replied','qualified','paid','delivered') then new.replied_at:=coalesce(new.replied_at,now()); end if;
  if new.stage in ('qualified','paid','delivered') then new.qualified_at:=coalesce(new.qualified_at,now()); end if;
  if new.stage in ('paid','delivered') then new.paid_at:=coalesce(new.paid_at,now()); end if;
  if new.stage='delivered' then new.delivered_at:=coalesce(new.delivered_at,now()); end if;
  if new.stage='lost' then new.lost_at:=coalesce(new.lost_at,now()); end if;
  return new;
end;
$$;

create or replace function public.validation_contact_after_write()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_experiment_id uuid;
begin
  v_experiment_id:=case when tg_op='DELETE' then old.experiment_id else new.experiment_id end;
  if tg_op='INSERT' then
    insert into public.validation_events(experiment_id,contact_id,event_type,to_stage,amount,currency,note) values(new.experiment_id,new.id,'created',new.stage,new.amount_paid,new.currency,new.notes);
  elsif tg_op='UPDATE' and (old.stage is distinct from new.stage or old.amount_paid is distinct from new.amount_paid) then
    insert into public.validation_events(experiment_id,contact_id,event_type,from_stage,to_stage,amount,currency,note) values(new.experiment_id,new.id,case when old.stage is distinct from new.stage then 'stage_changed' else 'payment_updated' end,old.stage,new.stage,new.amount_paid,new.currency,new.notes);
  elsif tg_op='DELETE' then
    insert into public.validation_events(experiment_id,contact_id,event_type,from_stage,note) values(old.experiment_id,null,'deleted',old.stage,old.notes);
  end if;
  perform public.refresh_experiment_execution(v_experiment_id);
  return coalesce(new,old);
end;
$$;

drop trigger if exists validation_contacts_before_write on public.validation_contacts;
create trigger validation_contacts_before_write before insert or update on public.validation_contacts for each row execute function public.validation_contact_before_write();
drop trigger if exists validation_contacts_after_write on public.validation_contacts;
create trigger validation_contacts_after_write after insert or update or delete on public.validation_contacts for each row execute function public.validation_contact_after_write();

revoke all on public.validation_contacts from anon,authenticated;
revoke all on public.validation_events from anon,authenticated;
revoke execute on function public.apply_experiment_verdict(uuid) from public,anon,authenticated;
revoke execute on function public.refresh_experiment_execution(uuid) from public,anon,authenticated;
revoke execute on function public.validation_contact_after_write() from public,anon,authenticated;
