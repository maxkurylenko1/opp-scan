import { config } from "@/lib/config";
import { getAdminClient } from "@/lib/supabase/admin";

const MODEL = "gpt-5.6-luna";
const RESEARCH_VERSION = "web-v2.1";
const REFRESH_DAYS = 7;

type ResearchResult = {
  market_summary: string;
  market_gap_score: number;
  product_demand_score: number;
  market_saturation_score: number;
  incumbent_risk_score: number;
  timing_score: number;
  regulatory_capital_risk_score: number;
  pricing_hypothesis: string;
  biggest_risk: string;
  competitors: Array<{
    name: string;
    url: string;
    price_min: number | null;
    price_max: number | null;
    currency: string | null;
    billing_period: string | null;
    strengths: string[];
    weaknesses: string[];
    evidence_url: string;
    pricing_verified: boolean;
  }>;
  evidence: Array<{
    source_url: string;
    claim_type: string;
    excerpt: string;
    evidence_weight: number;
    evidence_role: "competitor" | "pricing" | "problem_demand" | "service_spend" | "product_purchase_intent" | "market_gap" | "counter_evidence" | "incumbent_native";
    is_self_promo: boolean;
  }>;
};

function themeObject(value: unknown): any | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] || null;
  return value;
}

function validHttpUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hostOf(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

function collectWebSourceUrls(response: any) {
  const urls = new Set<string>();
  const visit = (value: any) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value.url === "string") {
      const parsed = validHttpUrl(value.url);
      if (parsed) urls.add(parsed);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "content" || key === "text") continue;
      visit(child);
    }
  };
  for (const item of response?.output || []) {
    if (item?.type === "web_search_call") visit(item);
  }
  return urls;
}

function extractOutputText(response: any) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text;
  for (const item of response?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("OpenAI response did not contain output text");
}

function urlKey(value: string) {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.hostname.replace(/^www\./, "").toLowerCase()}${path}`;
  } catch {
    return "";
  }
}

function supportedEvidenceUrl(url: string, sources: Set<string>) {
  const key = urlKey(url);
  if (!key) return false;
  for (const source of sources) if (urlKey(source) === key) return true;
  return false;
}

async function callResearch(theme: any, exactClusters: any[]): Promise<{ result: ResearchResult; sourceUrls: Set<string> }> {
  if (!config.openAiKey) throw new Error("OPENAI_API_KEY is not configured");

  const exactSummary = exactClusters
    .map((row) => {
      const cluster = themeObject(row.problem_clusters);
      if (!cluster) return null;
      return `- ${cluster.name}${cluster.summary ? `: ${cluster.summary}` : ""}`;
    })
    .filter(Boolean)
    .join("\n");

  const prompt = `Research the CURRENT market for this evidence-backed product opportunity theme.

Theme: ${theme.name}
Category: ${theme.category || "unknown"}
Summary: ${theme.summary || theme.name}
Underlying exact problems:
${exactSummary || "- No extra details"}

Your job is to DISCONFIRM as well as confirm the product hypothesis. Search for:
1. direct competitors and strong substitutes, including native/incumbent features;
2. current public pricing;
3. independent user/buyer reports of the painful problem;
4. people spending money on services/freelancers to solve the problem;
5. explicit intent to buy/subscribe to a PRODUCT that solves it;
6. workarounds, poor reviews, missing features, and reasons existing solutions are rejected;
7. counter-evidence: benchmarks, native features, or user reports suggesting the supposed problem/gap is weak;
8. timing signals such as newly released APIs/platform capabilities or rapidly rising discussion.

Critical evidence rules:
- Service spend proves willingness to pay to solve a problem, NOT willingness to subscribe to this proposed SaaS.
- Vendor pages, launch posts, founder self-promotion and competitor marketing prove market existence, NOT user demand.
- Many comments/replies inside one thread count as ONE independent evidence unit.
- Do not infer product purchase intent from merely mentioning pricing, paid plans, budgets, or subscriptions.
- Prefer first-party vendor/pricing pages for competitor facts and independent user/buyer sources for demand claims.
- Never invent a price, competitor, weakness, URL, purchase intent, or unmet gap.
- Include meaningful negative/counter evidence when found.

Scores, all 0-10:
- market_gap_score: 0 = commodity/crowded with strong solutions; 5 = mixed; 10 = clear unmet gap.
- product_demand_score: evidence that buyers want THIS product-shaped solution, not merely custom work.
- market_saturation_score: 0 = sparse; 10 = many mature substitutes with low differentiation.
- incumbent_risk_score: 0 = no obvious native incumbent; 10 = platform/vendor can already solve or absorb it.
- timing_score: 0 = no special timing; 10 = strong recent platform/API/regulatory/behavioral tailwind.
- regulatory_capital_risk_score: 0 = simple solo software; 10 = heavily regulated, capital intensive, proprietary-data dependent, or implausible for a solo builder.

Be conservative. pricing_hypothesis must distinguish observed market pricing from an unproven recurring-price hypothesis. biggest_risk is the strongest reason NOT to pursue the opportunity.`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      market_summary: { type: "string" },
      market_gap_score: { type: "number", minimum: 0, maximum: 10 },
      product_demand_score: { type: "number", minimum: 0, maximum: 10 },
      market_saturation_score: { type: "number", minimum: 0, maximum: 10 },
      incumbent_risk_score: { type: "number", minimum: 0, maximum: 10 },
      timing_score: { type: "number", minimum: 0, maximum: 10 },
      regulatory_capital_risk_score: { type: "number", minimum: 0, maximum: 10 },
      pricing_hypothesis: { type: "string" },
      biggest_risk: { type: "string" },
      competitors: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            url: { type: "string" },
            price_min: { type: ["number", "null"] },
            price_max: { type: ["number", "null"] },
            currency: { type: ["string", "null"] },
            billing_period: { type: ["string", "null"] },
            strengths: { type: "array", items: { type: "string" }, maxItems: 4 },
            weaknesses: { type: "array", items: { type: "string" }, maxItems: 4 },
            evidence_url: { type: "string" },
            pricing_verified: { type: "boolean" },
          },
          required: ["name","url","price_min","price_max","currency","billing_period","strengths","weaknesses","evidence_url","pricing_verified"],
        },
      },
      evidence: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            source_url: { type: "string" },
            claim_type: { type: "string", enum: ["competitor", "pricing", "problem_demand", "service_spend", "product_purchase_intent", "market_gap", "counter_evidence", "incumbent_native"] },
            excerpt: { type: "string" },
            evidence_weight: { type: "number", minimum: 1, maximum: 10 },
            evidence_role: { type: "string", enum: ["competitor", "pricing", "problem_demand", "service_spend", "product_purchase_intent", "market_gap", "counter_evidence", "incumbent_native"] },
            is_self_promo: { type: "boolean" },
          },
          required: ["source_url","claim_type","excerpt","evidence_weight","evidence_role","is_self_promo"],
        },
      },
    },
    required: ["market_summary","market_gap_score","product_demand_score","market_saturation_score","incumbent_risk_score","timing_score","regulatory_capital_risk_score","pricing_hypothesis","biggest_risk","competitors","evidence"],
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      reasoning: { effort: "low" },
      tools: [{ type: "web_search_preview", search_context_size: "medium" }],
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
      input: prompt,
      max_output_tokens: 2400,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "theme_market_research",
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!response.ok) throw new Error(`OpenAI research failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  const outputText = extractOutputText(body);
  const result = JSON.parse(outputText) as ResearchResult;
  return { result, sourceUrls: collectWebSourceUrls(body) };
}

export async function researchThemes(limit = 3, force = false) {
  const supabase = getAdminClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select("id,title,theme_id,opportunity_score,opportunity_themes!inner(id,name,summary,category,market_researched_at,market_research_version)")
    .not("theme_id", "is", null)
    .in("status", ["research", "validate", "build"])
    .order("opportunity_score", { ascending: false })
    .limit(Math.max(1, Math.min(limit * 3, 20)));
  if (error) throw error;

  const cutoff = Date.now() - REFRESH_DAYS * 86400_000;
  const selected = (opportunities || []).filter((row: any) => {
    const theme = themeObject(row.opportunity_themes);
    if (!theme) return false;
    if (force || !theme.market_researched_at || theme.market_research_version !== RESEARCH_VERSION) return true;
    return new Date(theme.market_researched_at).getTime() < cutoff;
  }).slice(0, Math.max(1, Math.min(limit, 5)));

  const summaries: any[] = [];
  for (const opportunity of selected) {
    const theme = themeObject(opportunity.opportunity_themes);
    const { data: links, error: linkError } = await supabase
      .from("theme_clusters")
      .select("similarity,problem_clusters!inner(name,summary,category)")
      .eq("theme_id", theme.id)
      .order("similarity", { ascending: false })
      .limit(8);
    if (linkError) throw linkError;

    const { result, sourceUrls } = await callResearch(theme, links || []);
    const verifiedHosts = new Set([...sourceUrls].map(hostOf).filter(Boolean));

    const competitors = result.competitors.filter((item) => {
      const url = validHttpUrl(item.url);
      const evidenceUrl = validHttpUrl(item.evidence_url);
      return Boolean(url && evidenceUrl && supportedEvidenceUrl(evidenceUrl, sourceUrls) && (hostOf(url) === hostOf(evidenceUrl) || verifiedHosts.has(hostOf(url))));
    });

    const evidence = result.evidence.filter((item) => {
      const url = validHttpUrl(item.source_url);
      return Boolean(url && supportedEvidenceUrl(url, sourceUrls));
    });

    await supabase.from("competitors")
      .delete()
      .eq("opportunity_id", opportunity.id)
      .eq("research_version", RESEARCH_VERSION);
    await supabase.from("evidence")
      .delete()
      .eq("opportunity_id", opportunity.id)
      .eq("source_kind", "web_research");

    if (competitors.length) {
      const { error: competitorError } = await supabase.from("competitors").insert(competitors.map((item) => ({
        opportunity_id: opportunity.id,
        name: item.name.slice(0, 200),
        url: validHttpUrl(item.url),
        price_min: item.pricing_verified ? item.price_min : null,
        price_max: item.pricing_verified ? item.price_max : null,
        currency: item.pricing_verified && item.currency ? item.currency.slice(0, 3).toUpperCase() : null,
        billing_period: item.pricing_verified ? item.billing_period : null,
        strengths: item.strengths.slice(0, 4),
        weaknesses: item.weaknesses.slice(0, 4),
        evidence_url: validHttpUrl(item.evidence_url),
        observed_at: new Date().toISOString(),
        research_version: RESEARCH_VERSION,
        research_run_at: new Date().toISOString(),
      })));
      if (competitorError) throw competitorError;
    }

    if (evidence.length) {
      const { error: evidenceError } = await supabase.from("evidence").insert(evidence.map((item) => ({
        opportunity_id: opportunity.id,
        signal_id: null,
        source_url: validHttpUrl(item.source_url),
        source_kind: "web_research",
        claim_type: item.claim_type,
        excerpt: item.excerpt.slice(0, 1000),
        evidence_weight: Math.max(1, Math.min(10, Number(item.evidence_weight) || 5)),
        evidence_role: item.evidence_role,
        is_self_promo: Boolean(item.is_self_promo),
        independence_key: urlKey(item.source_url),
        observed_at: new Date().toISOString(),
      })));
      if (evidenceError) throw evidenceError;
    }

    const pricingEvidenceCount = competitors.filter((item) => item.pricing_verified && (item.price_min != null || item.price_max != null)).length;
    const independentDemandKeys = new Set(
      evidence
        .filter((item) => !item.is_self_promo && ["problem_demand", "product_purchase_intent"].includes(item.evidence_role))
        .map((item) => urlKey(item.source_url))
        .filter(Boolean),
    );
    const directPurchaseEvidenceCount = evidence.filter((item) => !item.is_self_promo && item.evidence_role === "product_purchase_intent").length;
    const serviceSpendEvidenceCount = evidence.filter((item) => !item.is_self_promo && item.evidence_role === "service_spend").length;
    const counterEvidenceCount = evidence.filter((item) => item.evidence_role === "counter_evidence" || item.evidence_role === "incumbent_native").length;

    const { error: themeError } = await supabase.from("opportunity_themes").update({
      market_researched_at: new Date().toISOString(),
      market_summary: result.market_summary.slice(0, 4000),
      market_research_version: RESEARCH_VERSION,
      market_competitor_count: competitors.length,
      market_pricing_evidence_count: pricingEvidenceCount,
      market_gap_score: Math.max(0, Math.min(10, Number(result.market_gap_score) || 0)),
      market_product_demand_score: Math.max(0, Math.min(10, Number(result.product_demand_score) || 0)),
      market_saturation_score: Math.max(0, Math.min(10, Number(result.market_saturation_score) || 0)),
      market_incumbent_risk_score: Math.max(0, Math.min(10, Number(result.incumbent_risk_score) || 0)),
      market_timing_score: Math.max(0, Math.min(10, Number(result.timing_score) || 0)),
      market_regulatory_capital_risk_score: Math.max(0, Math.min(10, Number(result.regulatory_capital_risk_score) || 0)),
      market_counter_evidence_count: counterEvidenceCount,
      market_direct_purchase_evidence_count: directPurchaseEvidenceCount,
      market_service_spend_evidence_count: serviceSpendEvidenceCount,
      market_independent_demand_source_count: independentDemandKeys.size,
      market_pricing_hypothesis: result.pricing_hypothesis.slice(0, 2000),
      market_biggest_risk: result.biggest_risk.slice(0, 2000),
      updated_at: new Date().toISOString(),
    }).eq("id", theme.id);
    if (themeError) throw themeError;

    summaries.push({
      themeId: theme.id,
      name: theme.name,
      competitors: competitors.length,
      pricingEvidence: pricingEvidenceCount,
      evidence: evidence.length,
      searchSources: sourceUrls.size,
      gapScore: result.market_gap_score,
      productDemandScore: result.product_demand_score,
      independentDemandSources: independentDemandKeys.size,
      directPurchaseEvidence: directPurchaseEvidenceCount,
      serviceSpendEvidence: serviceSpendEvidenceCount,
      counterEvidence: counterEvidenceCount,
    });
  }

  if (selected.length) {
    const { error: rankError } = await supabase.rpc("radar_refresh_and_rank");
    if (rankError) throw rankError;
  }

  return { model: MODEL, researchVersion: RESEARCH_VERSION, researched: summaries.length, themes: summaries };
}
