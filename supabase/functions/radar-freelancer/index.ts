import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async () => {
  const { data: source, error: sourceError } = await db.from("sources").upsert({
    key: "freelancer",
    name: "Freelancer",
    kind: "marketplace",
    enabled: true,
    base_url: "https://www.freelancer.com",
  }, { onConflict: "key" }).select("id").single();
  if (sourceError) return new Response(JSON.stringify({ ok: false, error: sourceError.message }), { status: 500 });

  const { data: run } = await db.from("collection_runs").insert({ source_id: source.id, collector: "freelancer", status: "running" }).select("id").single();
  try {
    const endpoint = "https://www.freelancer.com/api/projects/0.1/projects/active/?limit=100&compact=true&job_details=true";
    const res = await fetch(endpoint, { headers: { "User-Agent": "OpportunityRadar/1.2" } });
    if (!res.ok) throw new Error(`Freelancer ${res.status}`);
    const payload = await res.json();
    const relevant = /(javascript|typescript|react|next|node|python|api|software|web scraping|automation|chrome|browser|extension|ai |artificial intelligence|machine learning|chatgpt|llm|saas|shopify|wordpress|data processing|devops|aws|docker|postgres|database)/i;
    const projects = (payload.result?.projects || []).filter((p: any) => {
      const jobs = (p.jobs || []).map((j: any) => j.name || "").join(" ");
      return relevant.test(`${p.title || ""} ${p.preview_description || ""} ${jobs}`);
    }).slice(0, 50);

    let inserted = 0;
    for (const p of projects) {
      const sign = p.currency?.sign || p.currency?.code || "$";
      const min = p.budget?.minimum ?? null;
      const max = p.budget?.maximum ?? null;
      const budget = min != null || max != null ? `Budget: ${sign}${min ?? "?"}-${sign}${max ?? "?"}. ` : "";
      const jobs = (p.jobs || []).map((j: any) => j.name).filter(Boolean).join(", ");
      const body = `${budget}${p.preview_description || ""}\nSkills: ${jobs}`.trim();
      const url = `https://www.freelancer.com/projects/${p.seo_url || p.id}`;
      const bytes = new TextEncoder().encode(`${p.title}|${body}|${url}`);
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const contentHash = Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
      const timestamp = p.time_submitted || p.submitdate || Math.floor(Date.now() / 1000);
      const { data, error } = await db.from("raw_items").upsert({
        source_id: source.id,
        external_id: String(p.id),
        source_url: url,
        author: null,
        title: p.title || "Freelance software project",
        body,
        published_at: new Date(timestamp * 1000).toISOString(),
        raw_payload: { budget: p.budget, currency: p.currency, jobs: p.jobs, urgent: p.urgent, bid_stats: p.bid_stats, collector: "freelancer-v1.2" },
        content_hash: contentHash,
      }, { onConflict: "source_id,external_id", ignoreDuplicates: true }).select("id").maybeSingle();
      if (error) throw error;
      if (data?.id) inserted++;
    }

    if (run?.id) await db.from("collection_runs").update({ status: "success", finished_at: new Date().toISOString(), records_seen: projects.length, records_inserted: inserted }).eq("id", run.id);
    await db.from("sources").update({ last_success_at: new Date().toISOString() }).eq("id", source.id);
    return new Response(JSON.stringify({ ok: true, seen: projects.length, inserted }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (run?.id) await db.from("collection_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_text: error }).eq("id", run.id);
    return new Response(JSON.stringify({ ok: false, error }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
