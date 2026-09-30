import { config } from "@/lib/config";
import { getEarlyResearchLeads } from "@/lib/research/early-leads";
import { getAdminClient } from "@/lib/supabase/admin";

type Surface = "ask_hn" | "show_hn" | "github_issues";
type Provider = "hackernews" | "github";
type SuggestionType = "possible_report" | "possible_solution" | "github_issue";

type Lead = {
  id: string;
  anchor_signal_id: string;
  source_url: string;
  source_key: string;
  title: string;
  status: string;
  search_query: string | null;
  last_external_search_at: string | null;
  external_last_error: string | null;
  created_at: string;
};

type Candidate = {
  provider: Provider;
  surface: Surface;
  source_url: string;
  title: string;
  source_published_at: string | null;
  suggestion_type: SuggestionType;
  search_query: string;
  keyword_overlap: number;
};

type SurfaceResult = {
  provider: Provider;
  surface: Surface;
  status: "success" | "rate_limited" | "error";
  results_seen: number;
  candidates: Candidate[];
  error_code: string | null;
};

const STOP = new Set([
  "ask", "hn", "show", "how", "what", "where", "when", "why", "does", "which",
  "could", "would", "there", "from", "with", "into", "between", "need", "needs",
  "having", "using", "used", "user", "users", "problem", "problems", "issues",
  "looking", "finding", "anyone", "someone", "help", "make", "doesnt", "dont",
  "about", "this", "that", "these", "those", "your", "mine", "have", "been",
  "will", "want", "wanting", "getting", "handle", "handling", "better", "than",
  "tools", "tool", "software", "project", "projects", "service", "services",
  "application", "applications", "app", "apps", "feature", "request", "requests",
  "without", "create", "creating", "build", "building", "currently",
]);

function words(text: string): string[] {
  const normalized = text.toLowerCase()
    .replace(/\bk[\s-]?1\b/g, "k1")
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .replace(/[^a-z0-9]+/g, " ");
  return [...new Set(normalized.split(/\s+/).filter(
    (x) => x.length >= 2 && x.length <= 30 && !STOP.has(x),
  ))];
}

export function searchTerms(value: string): string[] {
  return words(value).slice(0, 6);
}

export function validateResearchQuery(value: string): string | null {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  if (trimmed.length > 100 || !/^[a-zA-Z0-9][a-zA-Z0-9 .-]*$/.test(trimmed)) return null;
  if (searchTerms(trimmed).length < 2) return null;
  return trimmed;
}

function leadQuery(lead: Lead) {
  if (lead.search_query) return validateResearchQuery(lead.search_query);
  const generated = words(lead.title).slice(0, 4).join(" ");
  return validateResearchQuery(generated);
}

function overlap(query: string, text: string) {
  const candidates = new Set(words(text));
  return searchTerms(query).filter((term) => candidates.has(term)).length;
}

function cleanText(value: unknown): string {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

function rateStatus(status: number): SurfaceResult["status"] {
  return status === 403 || status === 429 ? "rate_limited" : "error";
}

function failed(provider: Provider, surface: Surface, code: string,
  status: SurfaceResult["status"] = "error"): SurfaceResult {
  return { provider, surface, status, error_code: code.slice(0, 60),
    results_seen: 0, candidates: [] };
}

async function searchHN(
  query: string,
  surface: "ask_hn" | "show_hn",
  anchorAuthor: string | null,
): Promise<SurfaceResult> {
  const provider: Provider = "hackernews";
  const params = new URLSearchParams({
    query,
    tags: surface,
    hitsPerPage: "10",
    numericFilters: "created_at_i>" +
      Math.floor(Date.now() / 1000 - 730 * 86400),
  });
  try {
    const response = await fetch(
      "https://hn.algolia.com/api/v1/search?" + params,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000),
        cache: "no-store" },
    );
    if (!response.ok) return failed(provider, surface, "http_" + response.status,
      rateStatus(response.status));

    const body = await response.json();
    const hits: any[] = Array.isArray(body.hits) ? body.hits.slice(0, 10) : [];
    const candidates: Candidate[] = [];

    for (const hit of hits) {
      const objectId = String(hit.objectID || "");
      if (!/^\d{1,16}$/.test(objectId)) continue;
      if (anchorAuthor && hit.author &&
        anchorAuthor.toLowerCase() === String(hit.author).toLowerCase()) continue;

      const title = cleanText(hit.title);
      const description = cleanText(hit.story_text);
      if (title.length < 12) continue;
      const relevant = overlap(query, title + " " + description.slice(0, 4000));
      if (relevant < 2) continue;

      // A Show HN launch is competitive supply/timing, never independent demand.
      // Ask HN results are still just candidate reports, not verified buyers.
      if (surface === "ask_hn" &&
        /\b(i built|we built|i launched|we launched|try my app)\b/i.test(
          title + " " + description.slice(0, 300),
        )) continue;

      candidates.push({
        provider, surface,
        source_url: "https://news.ycombinator.com/item?id=" + objectId,
        title: title.slice(0, 240),
        source_published_at: typeof hit.created_at === "string" ?
          hit.created_at : null,
        suggestion_type: surface === "ask_hn" ?
          "possible_report" : "possible_solution",
        search_query: query,
        keyword_overlap: relevant,
      });
    }
    candidates.sort((a, b) => b.keyword_overlap - a.keyword_overlap);
    return { provider, surface, status: "success", results_seen: hits.length,
      error_code: null, candidates: candidates.slice(0, 3) };
  } catch {
    return failed(provider, surface, "network_or_parse_error");
  }
}

async function searchGitHub(
  query: string, anchorAuthor: string | null,
): Promise<SurfaceResult> {
  const provider: Provider = "github";
  const surface: Surface = "github_issues";
  const params = new URLSearchParams({
    q: query + " in:title,body is:issue",
    sort: "updated", order: "desc", per_page: "10",
  });
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "opp-scan-external-research-v214",
  };
  if (config.githubToken) headers.Authorization = "Bearer " + config.githubToken;

  try {
    const response = await fetch(
      "https://api.github.com/search/issues?" + params,
      { headers, signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!response.ok) return failed(provider, surface,
      "http_" + response.status, rateStatus(response.status));

    const body = await response.json();
    const items: any[] = Array.isArray(body.items) ? body.items.slice(0, 10) : [];
    const candidates: Candidate[] = [];

    for (const item of items) {
      if (item.pull_request || item.user?.type === "Bot" ||
        /\[bot\]$/i.test(String(item.user?.login || ""))) continue;
      if (anchorAuthor && item.user?.login &&
        anchorAuthor.toLowerCase() === String(item.user.login).toLowerCase()) continue;

      const url = String(item.html_url || "");
      if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(url)) continue;

      const title = cleanText(item.title);
      const description = cleanText(item.body);
      if (title.length < 12 ||
        /^(fix|feat|chore|docs|test|ci|build|refactor|roadmap|phase|epic|weekly|daily)(?:\(|:|\s|\[)/i.test(title) ||
        /(this issue does not authorize|definition of done for this issue|daily repository status report)/i.test(description)) continue;

      const relevant = overlap(query, title + " " + description.slice(0, 4000));
      if (relevant < 2) continue;
      candidates.push({
        provider, surface,
        source_url: url, title: title.slice(0, 240),
        source_published_at: typeof item.created_at === "string" ?
          item.created_at : null,
        suggestion_type: "github_issue", search_query: query,
        keyword_overlap: relevant,
      });
    }
    candidates.sort((a, b) => b.keyword_overlap - a.keyword_overlap);
    return { provider, surface, status: "success", error_code: null,
      results_seen: items.length, candidates: candidates.slice(0, 3) };
  } catch {
    return failed(provider, surface, "network_or_parse_error");
  }
}

function eligible(lead: Lead) {
  if (lead.status === "archived") return false;
  if (!lead.last_external_search_at) return true;
  const cutoff = lead.external_last_error ? 86400_000 : 7 * 86400_000;
  return Date.now() - Date.parse(lead.last_external_search_at) > cutoff;
}

export async function searchExternalResearch(limit = 4, leadId?: string) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 4) {
    throw new Error("limit must be 1–4 leads per invocation");
  }
  const db = getAdminClient();
  if (!db) throw new Error("Supabase is not configured");

  let selection = db.from("research_leads")
    .select("id,anchor_signal_id,source_url,source_key,title,status,search_query,last_external_search_at,external_last_error,created_at")
    .in("status", ["new", "research", "validate"])
    .order("last_external_search_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(40);
  if (leadId) selection = selection.eq("id", leadId);

  const { data, error } = await selection;
  if (error) throw error;
  const leads = ((data || []) as Lead[]).filter(eligible).slice(0, limit);
  const manual = await getEarlyResearchLeads();
  const knownReferences = new Map(manual.map((item) => [
    item.sourceUrl, new Set(item.researchReferences.map((ref) => ref.url)),
  ]));
  let githubThrottled = false;
  let requests = 0;
  let suggestionsAdded = 0;
  const failures: Array<{ source: Surface; code: string }> = [];

  for (const lead of leads) {
    const query = leadQuery(lead);
    if (!query) {
      const { error: queryError } = await db.from("research_leads")
        .update({ last_external_search_at: new Date().toISOString(),
          external_last_error: "needs_specific_search_query" })
        .eq("id", lead.id);
      if (queryError) throw queryError;
      failures.push({ source: "ask_hn", code: "needs_specific_search_query" });
      continue;
    }

    const { data: signal, error: signalError } = await db.from("signals")
      .select("raw_item_id,is_actionable").eq("id", lead.anchor_signal_id)
      .maybeSingle();
    if (signalError) throw signalError;
    if (!signal?.is_actionable) continue;

    const { data: raw, error: rawError } = await db.from("raw_items")
      .select("author").eq("id", signal.raw_item_id).maybeSingle();
    if (rawError) throw rawError;
    const anchorAuthor = raw?.author || null;

    const jobs: Array<Promise<SurfaceResult>> = [
      searchHN(query, "ask_hn", anchorAuthor),
      searchHN(query, "show_hn", anchorAuthor),
    ];
    if (!githubThrottled) jobs.push(searchGitHub(query, anchorAuthor));
    requests += jobs.length;
    const results = await Promise.all(jobs);
    if (results.some((item) => item.surface === "github_issues" &&
      item.status === "rate_limited")) githubThrottled = true;

    const existingManual = knownReferences.get(lead.source_url) || new Set<string>();
    const combined = new Map<string, Candidate>();
    for (const result of results) {
      if (result.status !== "success") {
        failures.push({ source: result.surface,
          code: result.error_code || result.status });
        continue;
      }
      for (const candidate of result.candidates) {
        if (candidate.source_url === lead.source_url ||
          existingManual.has(candidate.source_url)) continue;
        const prior = combined.get(candidate.source_url);
        if (!prior || candidate.keyword_overlap > prior.keyword_overlap) {
          combined.set(candidate.source_url, candidate);
        }
      }
    }

    const candidates = [...combined.values()];
    let additions: Candidate[] = [];
    if (candidates.length) {
      // Items already ingested by the existing collectors belong to V2.13's
      // corpus matcher. V2.14 stores *only* novel external search results.
      const urls = candidates.map((x) => x.source_url);
      const [{ data: existingRaw, error: rawMatchError },
        { data: existingExternal, error: extMatchError }] = await Promise.all([
        db.from("raw_items").select("source_url").in("source_url", urls),
        db.from("research_external_refs").select("source_url")
          .eq("lead_id", lead.id).in("source_url", urls),
      ]);
      if (rawMatchError) throw rawMatchError;
      if (extMatchError) throw extMatchError;
      const exclude = new Set([
        ...(existingRaw || []).map((x) => x.source_url),
        ...(existingExternal || []).map((x) => x.source_url),
      ]);
      additions = candidates.filter((x) => !exclude.has(x.source_url));
      if (additions.length) {
        const { error: insertError } = await db.from("research_external_refs")
          .upsert(additions.map((item) => ({
            lead_id: lead.id,
            provider: item.provider,
            source_url: item.source_url,
            title: item.title,
            source_published_at: item.source_published_at,
            suggestion_type: item.suggestion_type,
            search_query: item.search_query,
            keyword_overlap: item.keyword_overlap,
          })), {
            onConflict: "lead_id,source_url", ignoreDuplicates: true,
          });
        if (insertError) throw insertError;
        suggestionsAdded += additions.length;
      }
    }

    const runRows = results.map((result) => ({
      lead_id: lead.id,
      provider: result.provider,
      search_surface: result.surface,
      search_query: query,
      status: result.status,
      results_seen: result.results_seen,
      suggestions_added: additions.filter((item) =>
        item.surface === result.surface).length,
      error_code: result.error_code,
    }));
    const { error: runError } = await db.from("research_external_search_runs")
      .insert(runRows);
    if (runError) throw runError;

    const errors = results.filter((result) => result.status !== "success")
      .map((result) => result.surface + ":" + (result.error_code || result.status));
    const { error: updateError } = await db.from("research_leads")
      .update({
        last_external_search_at: new Date().toISOString(),
        external_last_error: errors.length ? errors.join(",").slice(0, 200) : null,
      }).eq("id", lead.id);
    if (updateError) throw updateError;
  }

  return {
    leadsSelected: leads.length,
    externalRequests: requests,
    suggestionsAdded,
    failures,
    independentlyVerified: 0,
    rankingUpdated: false,
    githubRateLimited: githubThrottled,
  };
}
