alter table public.validation_contacts
  add column if not exists discovery_version text,
  add column if not exists discovery_state text,
  add column if not exists discovery_reason text,
  add column if not exists match_score numeric(5,2),
  add column if not exists signal_id uuid references public.signals(id) on delete set null,
  add column if not exists raw_item_id uuid references public.raw_items(id) on delete set null,
  add column if not exists discovered_at timestamptz;

alter table public.validation_contacts
  drop constraint if exists validation_contacts_discovery_state_check;
alter table public.validation_contacts
  add constraint validation_contacts_discovery_state_check
  check (discovery_state is null or discovery_state in ('suggested','approved','dismissed'));

alter table public.validation_contacts
  drop constraint if exists validation_contacts_match_score_check;
alter table public.validation_contacts
  add constraint validation_contacts_match_score_check
  check (match_score is null or (match_score >= 0 and match_score <= 100));

create unique index if not exists validation_contacts_experiment_source_url_uidx
  on public.validation_contacts(experiment_id, source_url)
  where source_url is not null;
create index if not exists validation_contacts_discovery_state_idx
  on public.validation_contacts(experiment_id, discovery_state, match_score desc);
create index if not exists validation_contacts_signal_id_idx
  on public.validation_contacts(signal_id);

create or replace function public.discover_validation_prospects(
  p_limit_per_experiment integer default 20,
  p_min_score numeric default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  exp record;
  candidate record;
  inserted_count integer := 0;
  experiments_seen integer := 0;
  per_experiment integer;
  score numeric;
  reason text;
begin
  for exp in
    select e.id experiment_id, e.opportunity_id, o.theme_id, o.title opportunity_title
    from public.experiments e
    join public.opportunities o on o.id=e.opportunity_id
    where e.validation_version='validation-v1.5'
      and e.verdict='pending'
      and o.theme_id is not null
      and o.status in ('research','validate','build')
  loop
    experiments_seen := experiments_seen + 1;
    per_experiment := 0;

    for candidate in
      with theme_centers as (
        select pc.id, pc.embedding
        from public.theme_clusters tc
        join public.problem_clusters pc on pc.id=tc.cluster_id
        where tc.theme_id=exp.theme_id
          and pc.embedding is not null
      ), ranked as (
        select
          s.id signal_id,
          s.raw_item_id,
          s.problem,
          s.evidence_excerpt,
          s.money_signal_type,
          s.money_amount,
          s.money_currency,
          s.published_at,
          ri.author,
          ri.title,
          ri.body,
          ri.source_url,
          src.name source_name,
          src.kind source_kind,
          max(1 - (s.embedding <=> tc.embedding))::numeric as similarity,
          public.theme_tokens(coalesce(s.problem,'') || ' ' || coalesce(ri.title,'')) && public.theme_tokens(exp.opportunity_title) as shared_subject
        from public.signals s
        join public.raw_items ri on ri.id=s.raw_item_id
        join public.sources src on src.id=s.source_id
        cross join theme_centers tc
        where s.embedding is not null
          and s.is_actionable=true
          and ri.source_url is not null
          and coalesce(s.published_at,ri.published_at,ri.fetched_at) >= now() - interval '120 days'
          and (
            src.kind='marketplace'
            or (src.name='Stack Overflow' and ri.author is not null)
            or (src.kind='hackernews' and ri.author is not null)
          )
        group by s.id,s.raw_item_id,s.problem,s.evidence_excerpt,s.money_signal_type,s.money_amount,s.money_currency,s.published_at,
                 ri.author,ri.title,ri.body,ri.source_url,src.name,src.kind
      )
      select *,
        least(100,
          similarity * 70
          + case when source_kind='marketplace' then 20 when source_name='Stack Overflow' then 10 when source_kind='hackernews' then 8 else 0 end
          + case when money_signal_type is not null and money_signal_type <> 'none' then 10 else 0 end
          + case when published_at >= now() - interval '14 days' then 5 when published_at >= now() - interval '45 days' then 2 else 0 end
          + case when shared_subject then 5 else 0 end
        )::numeric(5,2) computed_score
      from ranked
      where (
        (source_kind='marketplace' and similarity >= 0.55 and (shared_subject or similarity >= 0.86))
        or (source_name='Stack Overflow' and similarity >= 0.72 and shared_subject)
        or (source_kind='hackernews' and similarity >= 0.75 and shared_subject)
      )
      order by computed_score desc, published_at desc nulls last
      limit greatest(p_limit_per_experiment * 3, p_limit_per_experiment)
    loop
      score := candidate.computed_score;
      if score < p_min_score then continue; end if;
      if exists (
        select 1 from public.validation_contacts vc
        where vc.experiment_id=exp.experiment_id and vc.source_url=candidate.source_url
      ) then continue; end if;

      reason := case
        when candidate.source_kind='marketplace' and candidate.money_signal_type <> 'none' then
          format('Direct paid request matching %s. Semantic match %s%%; shared subject: %s; explicit money signal%s.',
                 exp.opportunity_title, round(candidate.similarity*100)::int,
                 case when candidate.shared_subject then 'yes' else 'high-confidence semantic match' end,
                 case when candidate.money_amount is not null then format(' (%s %s)', candidate.money_currency, candidate.money_amount) else '' end)
        when candidate.source_kind='marketplace' then
          format('Marketplace request matching %s. Semantic match %s%%; shared subject: %s.',
                 exp.opportunity_title, round(candidate.similarity*100)::int,
                 case when candidate.shared_subject then 'yes' else 'high-confidence semantic match' end)
        else
          format('Public help request matching %s. Semantic match %s%% with shared subject. Review platform rules before any outreach.',
                 exp.opportunity_title, round(candidate.similarity*100)::int)
      end;

      insert into public.validation_contacts(
        experiment_id,name,handle,company,source_kind,source_url,stage,notes,
        discovery_version,discovery_state,discovery_reason,match_score,signal_id,raw_item_id,discovered_at
      ) values (
        exp.experiment_id,
        coalesce(nullif(candidate.author,''), left(coalesce(candidate.title,candidate.problem,'Public request'),180)),
        nullif(candidate.author,''),
        null,
        candidate.source_name,
        candidate.source_url,
        'prospect',
        left(coalesce(candidate.evidence_excerpt,candidate.body,candidate.problem,candidate.title,''),1200),
        'prospect-v1.7','suggested',reason,score,candidate.signal_id,candidate.raw_item_id,now()
      )
      on conflict do nothing;

      if found then
        inserted_count := inserted_count + 1;
        per_experiment := per_experiment + 1;
      end if;
      exit when per_experiment >= p_limit_per_experiment;
    end loop;
  end loop;

  return jsonb_build_object('version','prospect-v1.7','experiments',experiments_seen,'inserted',inserted_count);
end;
$$;

revoke all on function public.discover_validation_prospects(integer,numeric) from public, anon, authenticated;
