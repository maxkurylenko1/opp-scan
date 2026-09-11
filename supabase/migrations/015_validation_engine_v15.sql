alter table public.experiments
  add column if not exists validation_version text,
  add column if not exists channel text,
  add column if not exists offer text,
  add column if not exists offer_price numeric,
  add column if not exists offer_currency varchar(3),
  add column if not exists outreach_message text,
  add column if not exists followup_message text,
  add column if not exists failure_threshold text,
  add column if not exists stop_condition text,
  add column if not exists max_days integer,
  add column if not exists generated_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists experiments_verdict_created_idx
  on public.experiments(verdict, created_at desc);

create or replace function public.apply_experiment_verdict(p_experiment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
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
    next_status := case
      when o.confidence_score >= 70 and o.opportunity_score >= 65 then 'build'
      else 'validate'
    end;
  elsif e.verdict='fail' then
    next_status := case
      when exists (
        select 1 from public.experiments x
        where x.opportunity_id=o.id and x.verdict='fail' and x.id<>e.id
      ) then 'killed'
      else 'research'
    end;
  else
    next_status := 'research';
  end if;

  update public.opportunities
  set status=next_status, reviewed_at=now(), updated_at=now()
  where id=o.id;

  return next_status;
end;
$$;

revoke execute on function public.apply_experiment_verdict(uuid) from public, anon, authenticated;
