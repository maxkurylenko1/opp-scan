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
    pricingHypothesis: x.pricing_hypothesis,
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

  const base = toOpportunityView(data, data.theme_id ? "theme" : "exact");
  const { data: experiment } = await supabase
    .from("experiments")
    .select("id,hypothesis,method,audience,target_sample_size,success_metric,success_threshold,failure_threshold,stop_condition,success_paid_count,success_delivered_count,failure_contact_limit,failure_paid_below_count,max_days,channel,offer,offer_price,offer_currency,outreach_message,followup_message,verdict,notes,execution_state")
    .eq("opportunity_id", data.id)
    .eq("validation_version", "validation-v1.5")
    .maybeSingle();

  let validationPlan = null;
  if (experiment) {
    const { data: contacts, error: contactsError } = await supabase
      .from("validation_contacts")
      .select("contacted_at,replied_at,qualified_at,paid_at,delivered_at,lost_at,stage,amount_paid")
      .eq("experiment_id", experiment.id);
    if (contactsError) throw contactsError;
    const rows = contacts || [];
    const contactedCount = rows.filter((c: any) => c.contacted_at).length;
    const repliedCount = rows.filter((c: any) => c.replied_at).length;
    const qualifiedCount = rows.filter((c: any) => c.qualified_at).length;
    const paidCount = rows.filter((c: any) => c.paid_at || Number(c.amount_paid) > 0).length;
    const deliveredCount = rows.filter((c: any) => c.delivered_at).length;
    const lostCount = rows.filter((c: any) => c.lost_at || c.stage === "lost").length;
    const revenueAmount = rows.reduce((sum: number, c: any) => sum + Number(c.amount_paid || 0), 0);

    validationPlan = {
      id: experiment.id,
      hypothesis: experiment.hypothesis,
      method: experiment.method,
      audience: experiment.audience,
      targetSampleSize: experiment.target_sample_size,
      successMetric: experiment.success_metric,
      successThreshold: experiment.success_threshold,
      failureThreshold: experiment.failure_threshold,
      stopCondition: experiment.stop_condition,
      successPaidTarget: experiment.success_paid_count,
      successDeliveredTarget: experiment.success_delivered_count,
      failureMaxPaid: experiment.failure_paid_below_count == null ? null : Math.max(0, Number(experiment.failure_paid_below_count) - 1),
      maxDays: experiment.max_days,
      channel: experiment.channel,
      offer: experiment.offer,
      offerPrice: experiment.offer_price == null ? null : Number(experiment.offer_price),
      offerCurrency: experiment.offer_currency,
      outreachMessage: experiment.outreach_message,
      followupMessage: experiment.followup_message,
      verdict: experiment.verdict,
      notes: experiment.notes,
      contactedCount,
      repliedCount,
      qualifiedCount,
      paidCount,
      deliveredCount,
      lostCount,
      revenueAmount,
    };
  }

  if (!data.theme_id) return { ...base, validationPlan } satisfies OpportunityView;

  const [{ data: theme }, { data: competitors }, { data: evidence }] = await Promise.all([
    supabase.from("opportunity_themes").select("market_summary,market_researched_at").eq("id", data.theme_id).maybeSingle(),
    supabase.from("competitors").select("name,url,price_min,price_max,currency,billing_period,strengths,weaknesses,evidence_url").eq("opportunity_id", data.id).eq("research_version", "web-v1.4").order("price_min", { ascending: true, nullsFirst: false }),
    supabase.from("evidence").select("claim_type,source_url,excerpt,evidence_weight").eq("opportunity_id", data.id).eq("source_kind", "web_research").order("evidence_weight", { ascending: false }).limit(12),
  ]);

  return {
    ...base,
    marketSummary: theme?.market_summary || null,
    marketResearchedAt: theme?.market_researched_at || null,
    competitors: (competitors || []).map((row: any) => ({
      name: row.name,
      url: row.url,
      priceMin: row.price_min == null ? null : Number(row.price_min),
      priceMax: row.price_max == null ? null : Number(row.price_max),
      currency: row.currency,
      billingPeriod: row.billing_period,
      strengths: row.strengths || [],
      weaknesses: row.weaknesses || [],
      evidenceUrl: row.evidence_url,
    })),
    marketEvidence: (evidence || []).map((row: any) => ({
      claimType: row.claim_type,
      sourceUrl: row.source_url,
      excerpt: row.excerpt,
      evidenceWeight: Number(row.evidence_weight),
    })),
    validationPlan,
  } satisfies OpportunityView;
}
