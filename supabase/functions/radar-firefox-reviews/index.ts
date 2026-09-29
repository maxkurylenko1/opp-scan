import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const AMO = "https://addons.mozilla.org/api/v5";
const MAX_ADDONS = 18;
const MAX_REVIEW_AGE_DAYS = 45;

function textValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string,string>;
    return obj["en-US"] || obj.en || Object.values(obj)[0] || "";
  }
  return "";
}

function problemLike(body: string) {
  return /(doesn.?t|does not|no longer|broken|stopped|missing|wish|cannot|can.?t|slow|annoy|frustrat|bug|privacy|sync|login|crash|paywall|pricing|subscription|unusable|hard to|difficult|fails?|failure|need |feature|lost |removed|blocks?|error|issue|problem)/i.test(body);
}

async function sha256(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2,"0")).join("");
}

async function json(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": "OpportunityRadar/2.7 (+personal research)" },
  });
  if (!res.ok) throw new Error(`Mozilla Add-ons API ${res.status}: ${url}`);
  return await res.json();
}

Deno.serve(async () => {
  const { data: source, error: sourceError } = await db.from("sources").upsert({
    key: "firefox_reviews",
    name: "Firefox Add-on Reviews",
    kind: "review",
    enabled: true,
    base_url: "https://addons.mozilla.org",
  }, { onConflict: "key" }).select("id").single();

  if (sourceError) return new Response(JSON.stringify({ ok:false,error:sourceError.message }), { status:500 });

  const { data: run } = await db.from("collection_runs")
    .insert({ source_id:source.id, collector:"firefox_reviews", status:"running", metadata:{ collector_version:"firefox-reviews-v1.0" } })
    .select("id").single();

  try {
    const search = await json(`${AMO}/addons/search/?app=firefox&type=extension&sort=users&page_size=${MAX_ADDONS}`);
    const addons = (search.results || [])
      .filter((a:any) => Number(a.average_daily_users || 0) >= 10_000)
      .slice(0, MAX_ADDONS);

    const cutoff = Date.now() - MAX_REVIEW_AGE_DAYS * 86400_000;
    const rows = new Map<string,any>();
    let requests = 1;

    for (const addon of addons) {
      const addonName = textValue(addon.name) || addon.slug || `Addon ${addon.id}`;
      const api = `${AMO}/ratings/rating/?addon=${encodeURIComponent(addon.id)}&score=1,2&filter=without_empty_body&page_size=12`;
      const payload = await json(api);
      requests++;

      for (const rating of payload.results || []) {
        if (rating.is_deleted || rating.is_developer_reply) continue;
        const body = String(rating.body || "").trim();
        if (body.length < 30) continue;

        const created = rating.created ? Date.parse(rating.created) : NaN;
        if (Number.isFinite(created) && created < cutoff) continue;
        if (!problemLike(body) && body.length < 120) continue;

        rows.set(String(rating.id), {
          rating,
          addon,
          addonName,
          body,
          createdAt: Number.isFinite(created) ? new Date(created).toISOString() : new Date().toISOString(),
        });
      }
    }

    let inserted = 0;
    for (const row of rows.values()) {
      const r = row.rating;
      const addon = row.addon;
      const title = `${row.addonName}: ${Number(r.score || 0)}★ review`;
      const body = `Firefox extension review. ${row.body}`;
      const sourceUrl = `${AMO}/ratings/rating/${r.id}/`;
      const contentHash = await sha256(`${r.id}|${r.score}|${row.body}|${r.created || ""}`);

      const { data, error } = await db.from("raw_items").upsert({
        source_id: source.id,
        external_id: String(r.id),
        source_url: sourceUrl,
        author: null,
        title,
        body,
        published_at: row.createdAt,
        raw_payload: {
          collector: "firefox-reviews-v1.0",
          evidence_role: "problem_demand",
          review_score: Number(r.score || 0),
          addon_id: addon.id,
          addon_slug: addon.slug,
          addon_name: row.addonName,
          addon_url: addon.url || null,
          addon_average_daily_users: Number(addon.average_daily_users || 0),
          addon_rating_count: Number(addon.ratings?.count || 0),
          addon_average_rating: Number(addon.ratings?.average || 0),
          version: r.version?.version || null,
        },
        content_hash: contentHash,
      }, { onConflict:"source_id,external_id", ignoreDuplicates:true }).select("id").maybeSingle();

      if (error) throw error;
      if (data?.id) inserted++;
    }

    if (run?.id) await db.from("collection_runs").update({
      status:"success",
      finished_at:new Date().toISOString(),
      records_seen:rows.size,
      records_inserted:inserted,
      metadata:{
        collector_version:"firefox-reviews-v1.0",
        addons_scanned:addons.length,
        api_requests:requests,
        max_review_age_days:MAX_REVIEW_AGE_DAYS,
      },
    }).eq("id",run.id);

    await db.from("sources").update({ last_success_at:new Date().toISOString() }).eq("id",source.id);

    return new Response(JSON.stringify({ ok:true, addons:addons.length, seen:rows.size, inserted, requests }), {
      headers:{ "Content-Type":"application/json" },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (run?.id) await db.from("collection_runs").update({
      status:"failed", finished_at:new Date().toISOString(), error_text:error,
    }).eq("id",run.id);
    return new Response(JSON.stringify({ ok:false,error }), { status:500, headers:{ "Content-Type":"application/json" } });
  }
});
