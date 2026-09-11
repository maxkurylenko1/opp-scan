import { getAdminClient } from "@/lib/supabase/admin";

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
    ? await supabase.from("validation_contacts").select("*").in("experiment_id", ids).order("created_at", { ascending: false })
    : { data: [], error: null } as any;
  if (contactsError) throw contactsError;

  return {
    experiments: (experiments || []).map((experiment: any) => {
      const rows = (contacts || []).filter((c: any) => c.experiment_id === experiment.id);
      const metrics = {
        prospects: rows.length,
        contacted: rows.filter((c: any) => c.contacted_at).length,
        replied: rows.filter((c: any) => c.replied_at).length,
        qualified: rows.filter((c: any) => c.qualified_at).length,
        paid: rows.filter((c: any) => c.paid_at || Number(c.amount_paid) > 0).length,
        delivered: rows.filter((c: any) => c.delivered_at).length,
        lost: rows.filter((c: any) => c.lost_at || c.stage === "lost").length,
        revenue: rows.reduce((sum: number, c: any) => sum + Number(c.amount_paid || 0), 0),
      };
      const opportunity = Array.isArray(experiment.opportunities) ? experiment.opportunities[0] : experiment.opportunities;
      return { ...experiment, opportunity, contacts: rows, metrics };
    }),
  };
}
