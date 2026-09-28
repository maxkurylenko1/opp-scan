-- V2.4: distinguish policy/credential-blocked collectors from technical failures.

alter table public.collection_runs
  drop constraint if exists collection_runs_status_check;

alter table public.collection_runs
  add constraint collection_runs_status_check
  check (status = any (array['queued'::text,'running'::text,'success'::text,'failed'::text,'blocked'::text]));

update public.collection_runs
set status='blocked',
    finished_at=coalesce(finished_at,now()),
    error_text=coalesce(error_text,'Reddit Data API approval/credentials required'),
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'reason','reddit_approval_required',
      'policy','Responsible Builder Policy'
    )
where collector='reddit'
  and status='running'
  and started_at >= now()-interval '1 hour';
