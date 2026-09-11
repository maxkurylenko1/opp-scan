create or replace function public.normalize_opportunity_theme_name()
returns trigger
language plpgsql
set search_path=public,pg_catalog
as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+--\s+DONT BID IF.*$', '', 'i'));
  new.name := btrim(regexp_replace(new.name, '\s+--\s+\d+\s*$', '', 'i'));
  return new;
end;
$$;

drop trigger if exists normalize_opportunity_theme_name_trigger on public.opportunity_themes;
create trigger normalize_opportunity_theme_name_trigger
before insert or update of name on public.opportunity_themes
for each row execute function public.normalize_opportunity_theme_name();

update public.opportunity_themes set name=name where theme_version='theme-v1.0';
update public.opportunities o
set title=ot.name,updated_at=now()
from public.opportunity_themes ot
where o.theme_id=ot.id and o.score_version='theme-v1.0';
