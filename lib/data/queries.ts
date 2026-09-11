import { demoOpportunities } from "./demo";
import { getAdminClient } from "@/lib/supabase/admin";
import type { OpportunityView } from "@/lib/types";

export async function getDashboardData() {
  const supabase = getAdminClient();
  if (!supabase) return { mode: "demo", signalCount: 53, clusterCount: 53, opportunities: demoOpportunities };
  const [{ count: signalCount }, { count: clusterCount }, { data }] = await Promise.all([
    supabase.from("signals").select("*", { count: "exact", head: true }),
    supabase.from("problem_clusters").select("*", { count: "exact", head: true }),
    supabase.from("opportunities").select("*").order("opportunity_score", { ascending: false }).limit(10),
  ]);
  const opportunities: OpportunityView[] = (data || []).map((x) => ({ id: x.id, title: x.title, thesis: x.thesis, status: x.status, opportunityScore: Number(x.opportunity_score), confidenceScore: Number(x.confidence_score), targetCustomer: x.target_customer, timeToValidationDays: x.time_to_validation_days, whyNow: x.why_now, biggestRisk: x.biggest_risk, mvpScope: x.mvp_scope, acquisitionChannel: x.acquisition_channel, validationExperiment: x.validation_experiment }));
  return { mode: "live", signalCount: signalCount || 0, clusterCount: clusterCount || 0, opportunities };
}

export async function getOpportunity(id: string) {
  const supabase = getAdminClient();
  if (!supabase) return demoOpportunities.find((x) => x.id === id) || null;
  const { data } = await supabase.from("opportunities").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return { id: data.id, title: data.title, thesis: data.thesis, status: data.status, opportunityScore: Number(data.opportunity_score), confidenceScore: Number(data.confidence_score), targetCustomer: data.target_customer, timeToValidationDays: data.time_to_validation_days, whyNow: data.why_now, biggestRisk: data.biggest_risk, mvpScope: data.mvp_scope, acquisitionChannel: data.acquisition_channel, validationExperiment: data.validation_experiment } satisfies OpportunityView;
}
