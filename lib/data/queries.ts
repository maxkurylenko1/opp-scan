import { demoOpportunities } from "./demo";
import { getAdminClient } from "@/lib/supabase/admin";
import { getEarlyResearchLeads } from "@/lib/research/early-leads";
import type { OpportunityBriefView, OpportunityView } from "@/lib/types";

function toOpportunityView(x: any, origin: "theme" | "exact" = "exact"): OpportunityView {
  return {
    id: x.id,
    title: x.title,
    thesis: x.thesis,
    status: x.status,
    origin,
    opportunityScore: Number(x.opportunity_score),
    confidenceScore: Number(x.confidence_score),
    problemConfidenceScore: x.problem_confidence_score == null ? null : Number(x.problem_confidence_score),
    productConfidenceScore: x.product_confidence_score == null ? null : Number(x.product_confidence_score),
    decisionTier: x.decision_tier || null,
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
  if (!supabase) return {
    mode: "demo",
    signalCount: 53,
    clusterCount: 53,
    clusterMode: "heuristic-v1",
    latestScan: null,
    earlyLeads: [],
    markets: {
      us: demoOpportunities.slice(0, 5),
      eu: demoOpportunities.slice(0, 5),
    },
  };

  const [
    { count: signalCount },
    { count: themeCount },
    { count: semanticClusterCount },
    { count: heuristicClusterCount },
    { data: latestScan, error: scanError },
    earlyLeads,
  ] = await Promise.all([
    supabase.from("signals").select("*", { count: "exact", head: true }),
    supabase.from("opportunity_themes").select("*", { count: "exact", head: true }).eq("theme_version", "theme-v1.0").neq("status", "killed"),
    supabase.from("problem_clusters").select("*", { count: "exact", head: true }).eq("clustering_version", "semantic-v1.2").neq("status", "killed"),
    supabase.from("problem_clusters").select("*", { count: "exact", head: true }).eq("clustering_version", "heuristic-v1").neq("status", "killed"),
    supabase.from("radar_scans")
      .select("id,status,started_at,finished_at,opportunities_snapshot_count,metadata")
      .in("status", ["success", "partial"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getEarlyResearchLeads(),
  ]);
  if (scanError) throw scanError;

  const hasSemantic = (semanticClusterCount || 0) > 0;
  const clusterMode = hasSemantic ? "semantic-v1.2" : "heuristic-v1";

  const markets: Record<"us" | "eu", OpportunityView[]> = { us: [], eu: [] };

  if (latestScan?.id) {
    const { data: snapshot, error: snapshotError } = await supabase
      .from("radar_scan_opportunities")
      .select("opportunity_id,market,rank,title,origin,status,opportunity_score,confidence_score,problem_confidence_score,product_confidence_score,decision_tier,thesis,target_customer,why_now,mvp_scope,biggest_risk,pricing_hypothesis,time_to_validation_days")
      .eq("scan_id", latestScan.id)
      .order("market", { ascending: true })
      .order("rank", { ascending: true });
    if (snapshotError) throw snapshotError;

    for (const row of snapshot || []) {
      const market = row.market === "eu" ? "eu" : "us";
      markets[market].push({
        id: row.opportunity_id || `${latestScan.id}:${market}:${row.rank}`,
        title: row.title,
        thesis: row.thesis || "",
        status: row.status,
        origin: row.origin === "theme" ? "theme" : "exact",
        opportunityScore: Number(row.opportunity_score),
        confidenceScore: Number(row.confidence_score),
        problemConfidenceScore: Number(row.problem_confidence_score || 0),
        productConfidenceScore: Number(row.product_confidence_score || 0),
        decisionTier: row.decision_tier || null,
        targetCustomer: row.target_customer,
        timeToValidationDays: row.time_to_validation_days,
        whyNow: row.why_now,
        biggestRisk: row.biggest_risk,
        mvpScope: row.mvp_scope,
        pricingHypothesis: row.pricing_hypothesis,
      });
    }
  }

  // Backward-compatible fallback for deployments before market snapshots exist.
  if (!latestScan?.id && !markets.us.length && !markets.eu.length) {
    const { data: fallback } = await supabase
      .from("opportunities")
      .select("*")
      .in("status", ["watching", "research", "validate", "build", "winner"])
      .in("score_version", ["theme-v2.1", "exact-v2.2"])
      .order("decision_tier", { ascending: false })
      .order("opportunity_score", { ascending: false })
      .limit(5);
    const items = (fallback || []).map((x) => toOpportunityView(x, x.theme_id ? "theme" : "exact"));
    markets.us = items;
    markets.eu = items;
  }

  return {
    mode: "live",
    signalCount: signalCount || 0,
    clusterCount: (themeCount || 0) || (hasSemantic ? (semanticClusterCount || 0) : (heuristicClusterCount || 0)),
    clusterMode,
    earlyLeads,
    latestScan: latestScan ? {
      id: latestScan.id,
      status: latestScan.status,
      startedAt: latestScan.started_at,
      finishedAt: latestScan.finished_at,
      snapshotCount: latestScan.opportunities_snapshot_count,
      metadata: latestScan.metadata,
    } : null,
    markets,
  };
}

export async function getOpportunity(id: string) {
  const supabase = getAdminClient();
  if (!supabase) return demoOpportunities.find((x) => x.id === id) || null;
  const { data } = await supabase.from("opportunities").select("*").eq("id", id).maybeSingle();
  if (!data) return null;

  const base = toOpportunityView(data, data.theme_id ? "theme" : "exact");
  const [{ data: experiment }, { data: brief, error: briefError }] = await Promise.all([
    supabase.from("experiments")
      .select("id,hypothesis,method,audience,target_sample_size,success_metric,success_threshold,failure_threshold,stop_condition,success_paid_count,success_delivered_count,failure_contact_limit,failure_paid_below_count,max_days,channel,offer,offer_price,offer_currency,outreach_message,followup_message,verdict,notes,execution_state")
      .eq("opportunity_id", data.id)
      .eq("validation_version", "validation-v1.5")
      .maybeSingle(),
    supabase.from("opportunity_briefs").select("*").eq("opportunity_id", data.id).maybeSingle(),
  ]);
  if (briefError) throw briefError;

  const buildBrief: OpportunityBriefView | null = brief ? {
    readiness: brief.readiness,
    productType: brief.product_type,
    buildSummary: brief.build_summary,
    primaryUser: brief.primary_user,
    coreJob: brief.core_job,
    whyItCanWork: brief.why_it_can_work,
    evidenceBasis: brief.evidence_basis,
    mvpFeatures: Array.isArray(brief.mvp_features) ? brief.mvp_features : [],
    userFlow: Array.isArray(brief.user_flow) ? brief.user_flow : [],
    nonGoals: Array.isArray(brief.non_goals) ? brief.non_goals : [],
    technicalApproach: brief.technical_approach,
    risks: Array.isArray(brief.risks) ? brief.risks : [],
    unknowns: Array.isArray(brief.unknowns) ? brief.unknowns : [],
    buildDaysMin: brief.build_days_min,
    buildDaysMax: brief.build_days_max,
    validationDays: brief.validation_days,
    firstMilestone: brief.first_milestone,
    successDefinition: brief.success_definition,
    generatedAt: brief.generated_at,
  } : null;

  let validationPlan = null;
  if (experiment) {
    const { data: contacts, error: contactsError } = await supabase
      .from("validation_contacts")
      .select("contacted_at,replied_at,qualified_at,paid_at,delivered_at,lost_at,stage,amount_paid,discovery_state")
      .eq("experiment_id", experiment.id);
    if (contactsError) throw contactsError;
    const rows = (contacts || []).filter((c: any) => c.discovery_state !== "dismissed");
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
      contactedCount: rows.filter((c: any) => c.contacted_at).length,
      repliedCount: rows.filter((c: any) => c.replied_at).length,
      qualifiedCount: rows.filter((c: any) => c.qualified_at).length,
      paidCount: rows.filter((c: any) => c.paid_at || Number(c.amount_paid) > 0).length,
      deliveredCount: rows.filter((c: any) => c.delivered_at).length,
      lostCount: rows.filter((c: any) => c.lost_at || c.stage === "lost").length,
      revenueAmount: rows.reduce((sum: number, c: any) => sum + Number(c.amount_paid || 0), 0),
    };
  }

  if (!data.theme_id) return { ...base, validationPlan, buildBrief } satisfies OpportunityView;

  const [{ data: theme }, { data: competitors }, { data: evidence }] = await Promise.all([
    supabase.from("opportunity_themes").select("market_summary,market_researched_at,market_gap_score,market_product_demand_score,market_saturation_score,market_incumbent_risk_score,market_timing_score,market_counter_evidence_count,market_direct_purchase_evidence_count,market_service_spend_evidence_count,market_independent_demand_source_count").eq("id", data.theme_id).maybeSingle(),
    supabase.from("competitors").select("name,url,price_min,price_max,currency,billing_period,strengths,weaknesses,evidence_url").eq("opportunity_id", data.id).order("observed_at", { ascending: false }),
    supabase.from("evidence").select("claim_type,source_url,excerpt,evidence_weight").eq("opportunity_id", data.id).eq("source_kind", "web_research").order("evidence_weight", { ascending: false }).limit(12),
  ]);

  return {
    ...base,
    marketSummary: theme?.market_summary || null,
    marketResearchedAt: theme?.market_researched_at || null,
    marketGapScore: theme?.market_gap_score == null ? null : Number(theme.market_gap_score),
    marketProductDemandScore: theme?.market_product_demand_score == null ? null : Number(theme.market_product_demand_score),
    marketSaturationScore: theme?.market_saturation_score == null ? null : Number(theme.market_saturation_score),
    marketIncumbentRiskScore: theme?.market_incumbent_risk_score == null ? null : Number(theme.market_incumbent_risk_score),
    marketTimingScore: theme?.market_timing_score == null ? null : Number(theme.market_timing_score),
    marketCounterEvidenceCount: theme?.market_counter_evidence_count == null ? null : Number(theme.market_counter_evidence_count),
    marketDirectPurchaseEvidenceCount: theme?.market_direct_purchase_evidence_count == null ? null : Number(theme.market_direct_purchase_evidence_count),
    marketServiceSpendEvidenceCount: theme?.market_service_spend_evidence_count == null ? null : Number(theme.market_service_spend_evidence_count),
    marketIndependentDemandSourceCount: theme?.market_independent_demand_source_count == null ? null : Number(theme.market_independent_demand_source_count),
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
    buildBrief,
  } satisfies OpportunityView;
}
