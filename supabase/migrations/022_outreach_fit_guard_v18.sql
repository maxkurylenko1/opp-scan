alter table public.validation_contacts
  add column if not exists outreach_fit_score numeric,
  add column if not exists outreach_fit_decision text,
  add column if not exists outreach_fit_reason text;

alter table public.validation_contacts
  drop constraint if exists validation_contacts_outreach_fit_decision_check;
alter table public.validation_contacts
  add constraint validation_contacts_outreach_fit_decision_check
  check (outreach_fit_decision is null or outreach_fit_decision in ('send','review','skip'));

alter table public.validation_contacts
  drop constraint if exists validation_contacts_outreach_fit_score_check;
alter table public.validation_contacts
  add constraint validation_contacts_outreach_fit_score_check
  check (outreach_fit_score is null or (outreach_fit_score >= 0 and outreach_fit_score <= 100));
