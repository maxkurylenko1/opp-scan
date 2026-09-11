import { getAdminClient } from "@/lib/supabase/admin";

function queuePriority(contact: any) {
  if (contact.stage !== "prospect" && contact.stage !== "lost") return 0;
  if (contact.stage === "prospect" && contact.outreach_fit_decision === "send" && contact.outreach_state === "approved") return 1;
  if (contact.stage === "prospect" && contact.outreach_fit_decision === "send" && contact.outreach_state === "drafted") return 2;
  if (contact.stage === "prospect" && contact.outreach_fit_decision === "review") return 3;
  if (contact.stage === "prospect" && !contact.outreach_fit_decision) return 4;
  if (contact.stage === "prospect" && contact.outreach_fit_decision === "skip") return 6;
  return 7;
}

export async function getExecutionBoardData() {
  const supabase = getAdminClient();
  if (!supabase) return { experiments: [] };

  const { data: experiments, error } = await supabase
    .from("experiments")
    .select("*, opportunities!inner(id,title,status,opportunity_score,confidence_score)")
    .eq("validation_version", "validation-v1.5")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const ids = (experiments || []).map((x: any) => x.id);
  const { data: contacts, error: contactsError } = ids.length
    ? await supabase.from("validation_contacts").select("*").in("experiment_id", ids)
    : { data: [], error: null } as any;
  if (contactsError) throw contactsError;

  return {
    experiments: (experiments || []).map((experiment: any) => {
      const rows = (contacts || [])
        .filter((contact: any) => contact.experiment_id === experiment.id)
        .sort((a: any, b: any) => {
          const priorityDiff = queuePriority(a) - queuePriority(b);
          if (priorityDiff) return priorityDiff;
          const scoreDiff = Number(b.match_score || 0) - Number(a.match_score || 0);
          if (scoreDiff) return scoreDiff;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

      const activeRows = rows.filter((c: any) => c.discovery_state !== "dismissed");
      const targetContacts = Number(experiment.failure_contact_limit || experiment.target_sample_size || 30);
      const metrics = {
        prospects: activeRows.length,
        suggested: activeRows.filter((c: any) => c.discovery_state === "suggested").length,
        approved: activeRows.filter((c: any) => c.discovery_state === "approved" || !c.discovery_state).length,
        readyToContact: activeRows.filter((c: any) => c.stage === "prospect" && c.outreach_fit_decision === "send" && c.outreach_state === "approved" && c.outreach_message).length,
        draftsToApprove: activeRows.filter((c: any) => c.stage === "prospect" && c.outreach_fit_decision === "send" && c.outreach_state === "drafted" && c.outreach_message).length,
        needsReview: activeRows.filter((c: any) => c.stage === "prospect" && c.outreach_fit_decision === "review").length,
        skippedOutreach: activeRows.filter((c: any) => c.stage === "prospect" && c.outreach_fit_decision === "skip").length,
        awaitingFit: activeRows.filter((c: any) => c.stage === "prospect" && !c.outreach_fit_decision).length,
        contacted: activeRows.filter((c: any) => c.contacted_at).length,
        targetContacts,
        replied: activeRows.filter((c: any) => c.replied_at).length,
        qualified: activeRows.filter((c: any) => c.qualified_at).length,
        paid: activeRows.filter((c: any) => c.paid_at || Number(c.amount_paid) > 0).length,
        delivered: activeRows.filter((c: any) => c.delivered_at).length,
        lost: activeRows.filter((c: any) => c.lost_at || c.stage === "lost").length,
        revenue: activeRows.reduce((sum: number, c: any) => sum + Number(c.amount_paid || 0), 0),
      };
      const opportunity = Array.isArray(experiment.opportunities) ? experiment.opportunities[0] : experiment.opportunities;
      return { ...experiment, opportunity, contacts: rows.filter((c: any) => c.discovery_state !== "dismissed"), metrics };
    }),
  };
}
