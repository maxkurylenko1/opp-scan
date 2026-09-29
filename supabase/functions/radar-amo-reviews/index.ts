import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const API = "https://addons.mozilla.org/api/v5";

const DEFAULT_QUERIES = ["automation", "productivity", "developer", "ai assistant", "tab manager", "screenshot"];

function queries() {
  return [...new Set((Deno.env.get("AMO_REVIEW_QUERIES") || DEFAULT_QUERIES.join(","))
    .split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 10);
}

function localize(value: unknown) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string,string>;
  return obj["en-US"] || obj["en-GB"] || Object.values(obj).find(Boolean) || "";
}

function clean(value: string | null | undefined) {
  return (value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function classifyReview(text: string): "problem_demand" | "market_context" | null {
  const featureGap = /(missing|wish|need (?:a|an|to|way)|no way|without .* way|would be nice|feature|support for|option to|allow (?:me|us|users)|customi[sz]e|configure|manual|workflow|export|import|alternative|paywall|subscription|too expensive|privacy|permission)/i.test(text);
  if (featureGap) return "problem_demand";

  const productFailure = /(doesn'?t work|does not work|not working|broken|stopped working|slow|crash|freeze|unusable|bug|fails?|error|blank (?:screen|page)|login fails?|sign in fails?|sync .*error|lost|deleted)/i.test(text);
  if (productFailure) return "market_context";

  return null;
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureSource() {
  const { data, error } = await db.from("sources").upsert({
    key: "amo_reviews",
    name: "Firefox Add-on Reviews",
    kind: "app_review",
    enabled: true,
    base_url: "https://addons.mozilla.org",
  }, { onConflict: "key" }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

Deno.serve(async () => {
  const sourceId = await ensureSource();
  const { data: run, error: runError } = await db.from("collection_runs")
    .insert({ source_id: sourceId, collector: "amo_reviews", status: "running", metadata: { collector_version: "amo-reviews-v1.1" } })
    .select("id").single();

  if (runError) return new Response(JSON.stringify({ ok: false, error: runError.message }), { status: 500 });

  try {
    const headers = { Accept: "application/json", "User-Agent": "OpportunityRadar-AMO/1.0" };
    const addons = new Map<string,{ slug: string; name: string; users: number }>();
    const searches: Array<{ query: string; status: number; found: number }> = [];

    for (const query of queries()) {
      const url = API + "/addons/search/?q=" + encodeURIComponent(query) + "&app=firefox&type=extension&sort=users&page_size=4";
      const res = await fetch(url, { headers });
      if (!res.ok) {
        searches.push({ query, status: res.status, found: 0 });
        continue;
      }

      const payload = await res.json();
      let found = 0;
      for (const addon of payload.results || []) {
        const slug = addon.slug || "";
        if (!slug) continue;
        addons.set(slug, {
          slug,
          name: localize(addon.name) || slug,
          users: Number(addon.average_daily_users || 0),
        });
        found++;
      }
      searches.push({ query, status: res.status, found });
    }

    let seen = 0;
    let inserted = 0;
    let rejectedNoise = 0;
    let demandReviews = 0;
    let failureContextReviews = 0;
    const addonStats: Array<{ slug: string; status: number; reviews: number }> = [];

    for (const addon of [...addons.values()].slice(0, 18)) {
      const url = API + "/ratings/rating/?addon=" + encodeURIComponent(addon.slug) + "&score=1,2&filter=without_empty_body&page_size=12";
      const res = await fetch(url, { headers });
      if (!res.ok) {
        addonStats.push({ slug: addon.slug, status: res.status, reviews: 0 });
        continue;
      }

      const payload = await res.json();
      let kept = 0;
      for (const rating of payload.results || []) {
        const body = clean(rating.body);
        const score = Number(rating.score ?? rating.rating ?? 0);
        if (!body || ![1,2].includes(score)) continue;
        const evidenceRole = classifyReview(body);
        if (!evidenceRole) {
          rejectedNoise++;
          continue;
        }

        seen++;
        kept++;
        if (evidenceRole === "problem_demand") demandReviews++;
        else failureContextReviews++;
        const created = rating.created || new Date().toISOString();
        const title = (addon.name + ": " + body.slice(0, 180)).slice(0, 300);
        const sourceUrl = "https://addons.mozilla.org/firefox/addon/" + addon.slug + "/reviews/";
        const contentHash = await sha256(String(rating.id) + "|" + score + "|" + body);

        const { data, error } = await db.from("raw_items").upsert({
          source_id: sourceId,
          external_id: String(rating.id),
          source_url: sourceUrl,
          author: null,
          title,
          body: body.slice(0, 5000),
          published_at: created,
          raw_payload: {
            addon_slug: addon.slug,
            addon_name: addon.name,
            addon_users: addon.users,
            score,
            version: rating.version?.version || null,
            collector: "amo-reviews-v1.1",
            evidence_role: evidenceRole,
            review_role: evidenceRole === "problem_demand" ? "feature_or_workflow_gap" : "product_failure",
          },
          content_hash: contentHash,
        }, { onConflict: "source_id,external_id", ignoreDuplicates: true }).select("id").maybeSingle();

        if (error) throw error;
        if (data?.id) inserted++;
      }

      addonStats.push({ slug: addon.slug, status: res.status, reviews: kept });
    }

    await db.from("collection_runs").update({
      status: "success",
      finished_at: new Date().toISOString(),
      records_seen: seen,
      records_inserted: inserted,
      metadata: {
        collector_version: "amo-reviews-v1.1",
        searches,
        addons_checked: addonStats.length,
        addon_stats: addonStats,
        rejected_noise: rejectedNoise,
        demand_reviews: demandReviews,
        product_failure_context_reviews: failureContextReviews,
        role: "mixed_review_evidence",
      },
    }).eq("id", run.id);
    await db.from("sources").update({ last_success_at: new Date().toISOString() }).eq("id", sourceId);

    return new Response(JSON.stringify({ ok: true, seen, inserted, addons: addonStats.length, rejectedNoise, demandReviews, failureContextReviews, searches }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.from("collection_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_text: error }).eq("id", run.id);
    return new Response(JSON.stringify({ ok: false, error }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
