import { config } from "@/lib/config";
import { getAdminClient } from "@/lib/supabase/admin";

const MODEL = "gpt-5.6-luna";
const RESEARCH_VERSION = "web-v1.4";
const REFRESH_DAYS = 7;

type ResearchResult = {
  market_summary: string;
  market_gap_score: number;
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

function supportedBySearch(url: string, sources: Set<string>) {
  const host = hostOf(url);
  if (!host) return false;
  for (const source of sources) {
    if (hostOf(source) === host) return true;
  }
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

  const prompt = `Research the CURRENT market for this evidence-backed product opportunity theme.\n\nTheme: ${theme.name}\nCategory: ${theme.category || "unknown"}\nSummary: ${theme.summary || theme.name}\nUnderlying exact problems:\n${exactSummary || "- No extra details"}\n\nFind direct competitors and close substitutes, current public pricing, and evidence of whether the market has a meaningful gap. Prefer first-party vendor/product/pricing pages. Use third-party pages only when necessary. Never invent a price, competitor, weakness, or URL. Only include a competitor when a public page found during web search directly supports its existence. Mark pricing_verified=true only when the price is explicitly visible on a source you found.\n\nmarket_gap_score is 0-10: 0 = commodity/crowded with strong established solutions; 5 = mixed; 10 = clear unmet gap with weak or absent direct solutions. Be conservative. pricing_hypothesis is a short recommendation grounded in observed prices and the paid-demand evidence. biggest_risk is the single most important commercialization risk.`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      market_summary: { type: "string" },
      market_gap_score: { type: "number", minimum: 0, maximum: 10 },
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
            claim_type: { type: "string", enum: ["competitor", "pricing", "market_gap", "market_demand"] },
            excerpt: { type: "string" },
            evidence_weight: { type: "number", minimum: 1, maximum: 10 },
          },
          required: ["source_url","claim_type","excerpt","evidence_weight"],
        },
      },
    },
    required: ["market_summary","market_gap_score","pricing_hypothesis","biggest_risk","competitors","evidence"],
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
    .select("id,title,theme_id,opportunity_score,opportunity_themes!inner(id,name,summary,category,market_researched_at)")
    .not("theme_id", "is", null)
    .in("status", ["research", "validate", "build"])
    .order("opportunity_score", { ascending: false })
    .limit(Math.max(1, Math.min(limit * 3, 20)));
  if (error) throw error;

  const cutoff = Date.now() - REFRESH_DAYS * 86400_000;
  const selected = (opportunities || []).filter((row: any) => {
    const theme = themeObject(row.opportunity_themes);
    if (!theme) return false;
    if (force || !theme.market_researched_at) return true;
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
      return Boolean(url && evidenceUrl && (verifiedHosts.has(hostOf(url)) || verifiedHosts.has(hostOf(evidenceUrl))));
    });

    const evidence = result.evidence.filter((item) => {
      const url = validHttpUrl(item.source_url);
      return Boolean(url && verifiedHosts.has(hostOf(url)));
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
        observed_at: new Date().toISOString(),
      })));
      if (evidenceError) throw evidenceError;
    }

    const pricingEvidenceCount = competitors.filter((item) => item.pricing_verified && (item.price_min != null || item.price_max != null)).length;
    const { error: themeError } = await supabase.from("opportunity_themes").update({
      market_researched_at: new Date().toISOString(),
      market_summary: result.market_summary.slice(0, 4000),
      market_research_version: RESEARCH_VERSION,
      market_competitor_count: competitors.length,
      market_pricing_evidence_count: pricingEvidenceCount,
      market_gap_score: Math.max(0, Math.min(10, Number(result.market_gap_score) || 0)),
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
    });
  }

  if (selected.length) {
    const { error: rankError } = await supabase.rpc("radar_refresh_and_rank");
    if (rankError) throw rankError;
  }

  return { model: MODEL, researchVersion: RESEARCH_VERSION, researched: summaries.length, themes: summaries };
}
