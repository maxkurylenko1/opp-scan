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
  const { data: leads, error: leadsError } = ids.length
    ? await supabase.from("validation_leads").select("*").in("experiment_id", ids).order("created_at", { ascending: false })
    : { data: [], error: null } as any;
  if (leadsError) throw leadsError;

  return {
    experiments: (experiments || []).map((experiment: any) => {
      const rows = (leads || []).filter((lead: any) => lead.experiment_id === experiment.id);
      const opportunity = Array.isArray(experiment.opportunities) ? experiment.opportunities[0] : experiment.opportunities;
      return {
        ...experiment,
        opportunity,
        leads: rows,
        executionState: experiment.verdict === "pass"
          ? "validated"
          : experiment.verdict === "fail"
            ? "failed"
            : Number(experiment.contacted_count || 0) > 0
              ? "running"
              : "not-started",
      };
    }),
  };
}
