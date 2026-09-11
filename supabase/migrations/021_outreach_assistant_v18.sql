alter table public.validation_contacts
  add column if not exists outreach_state text not null default 'none',
  add column if not exists outreach_version text,
  add column if not exists outreach_model text,
  add column if not exists outreach_channel text,
  add column if not exists outreach_subject text,
  add column if not exists outreach_message text,
  add column if not exists outreach_followup text,
  add column if not exists outreach_rationale text,
  add column if not exists outreach_personalization jsonb not null default '[]'::jsonb,
  add column if not exists outreach_generated_at timestamptz,
  add column if not exists outreach_approved_at timestamptz;

alter table public.validation_contacts
  drop constraint if exists validation_contacts_outreach_state_check;
alter table public.validation_contacts
  add constraint validation_contacts_outreach_state_check
  check (outreach_state in ('none','drafted','approved','rejected'));

create index if not exists validation_contacts_outreach_state_idx
  on public.validation_contacts(experiment_id, outreach_state, discovery_state);

comment on column public.validation_contacts.outreach_state is 'V1.8 manual-review outreach draft lifecycle; never auto-sent.';
comment on column public.validation_contacts.outreach_message is 'Personalized first-touch draft generated from public source evidence and validation offer.';
comment on column public.validation_contacts.outreach_followup is 'Manual follow-up draft; sending is intentionally outside V1.8.';
