import { demoOpportunities } from "./demo";
import { getAdminClient } from "@/lib/supabase/admin";
import type { OpportunityView } from "@/lib/types";

function toOpportunityView(x: any, origin: "theme" | "exact" = "exact"): OpportunityView {
  return {
    id: x.id,
    title: x.title,
    thesis: x.thesis,
    status: x.status,
    origin,
    opportunityScore: Number(x.opportunity_score),
    confidenceScore: Number(x.confidence_score),
    targetCustomer: x.target_customer,
    timeToValidationDays: x.time_to_validation_days,
    whyNow: x.why_now,
    biggestRisk: x.biggest_risk,
    mvpScope: x.mvp_scope,
    acquisitionChannel: x.acquisition_channel,
    validationExperiment: x.validation_experiment,
  };
}

export async function getDashboardData() {
  const supabase = getAdminClient();
  if (!supabase) return { mode: "demo", signalCount: 53, clusterCount: 53, clusterMode: "heuristic-v1", opportunities: demoOpportunities };

  const [
    { count: signalCount },
    { count: themeCount },
    { count: semanticClusterCount },
    { count: heuristicClusterCount },
    { count: rankedThemeCount },
  ] = await Promise.all([
    supabase.from("signals").select("*", { count: "exact", head: true }),
    supabase.from("opportunity_themes").select("*", { count: "exact", head: true }).eq("theme_version", "theme-v1.0"),
    supabase.from("problem_clusters").select("*", { count: "exact", head: true }).eq("clustering_version", "semantic-v1.1"),
    supabase.from("problem_clusters").select("*", { count: "exact", head: true }).eq("clustering_version", "heuristic-v1"),
    supabase.from("opportunities").select("*", { count: "exact", head: true }).like("score_version", "theme-v1.%").not("theme_id", "is", null),
  ]);

  const hasRankedThemes = (rankedThemeCount || 0) > 0;
  const hasSemantic = (semanticClusterCount || 0) > 0;
  const clusterMode = hasRankedThemes ? "theme-v1 + semantic-v1.1" : hasSemantic ? "semantic-v1.1" : "heuristic-v1";

  const opportunities: OpportunityView[] = [];

  if (hasRankedThemes) {
    const { data: themes } = await supabase
      .from("opportunities")
      .select("*")
      .like("score_version", "theme-v1.%")
      .not("theme_id", "is", null)
      .in("status", ["research", "validate", "build", "winner"])
      .order("opportunity_score", { ascending: false })
      .limit(5);

    opportunities.push(...(themes || []).map((x) => toOpportunityView(x, "theme")));
  }

  const remaining = Math.max(0, 10 - opportunities.length);
  if (remaining > 0) {
    const exactMode = hasSemantic ? "semantic-v1.1" : "heuristic-v1";
    const { data: exact } = await supabase
      .from("opportunities")
      .select("*, problem_clusters!inner(clustering_version)")
      .eq("problem_clusters.clustering_version", exactMode)
      .in("status", ["research", "validate", "build", "winner"])
      .order("opportunity_score", { ascending: false })
      .limit(remaining);

    opportunities.push(...(exact || []).map((x) => toOpportunityView(x, "exact")));
  }

  return {
    mode: "live",
    signalCount: signalCount || 0,
    clusterCount: hasRankedThemes ? (themeCount || 0) : hasSemantic ? (semanticClusterCount || 0) : (heuristicClusterCount || 0),
    clusterMode,
    opportunities,
  };
}

export async function getOpportunity(id: string) {
  const supabase = getAdminClient();
  if (!supabase) return demoOpportunities.find((x) => x.id === id) || null;
  const { data } = await supabase.from("opportunities").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return toOpportunityView(data, data.theme_id ? "theme" : "exact");
}
