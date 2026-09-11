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
    insert into public.validation_events(experiment_id,contact_id,event_type,to_stage,amount,currency,note)
    values(new.experiment_id,new.id,'created',new.stage,new.amount_paid,new.currency,new.notes);
  elsif tg_op='UPDATE' and (old.stage is distinct from new.stage or old.amount_paid is distinct from new.amount_paid) then
    insert into public.validation_events(experiment_id,contact_id,event_type,from_stage,to_stage,amount,currency,note)
    values(new.experiment_id,new.id,case when old.stage is distinct from new.stage then 'stage_changed' else 'payment_updated' end,old.stage,new.stage,new.amount_paid,new.currency,new.notes);
  elsif tg_op='DELETE' then
    if exists(select 1 from public.experiments where id=old.experiment_id) then
      insert into public.validation_events(experiment_id,contact_id,event_type,from_stage,note)
      values(old.experiment_id,null,'deleted',old.stage,old.notes);
    end if;
  end if;

  if exists(select 1 from public.experiments where id=v_experiment_id) then
    perform public.refresh_experiment_execution(v_experiment_id);
  end if;
  return coalesce(new,old);
end;
$$;

revoke execute on function public.validation_contact_after_write() from public,anon,authenticated;
