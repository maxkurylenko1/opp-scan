import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const clean = (s: string) => (s || "").replace(/<[^>]*>/g, " ").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

Deno.serve(async () => {
  const { data: source, error: sourceError } = await db.from("sources").upsert({
    key: "stackoverflow",
    name: "Stack Overflow",
    kind: "web",
    enabled: true,
    base_url: "https://stackoverflow.com",
  }, { onConflict: "key" }).select("id").single();
  if (sourceError) return new Response(JSON.stringify({ ok: false, error: sourceError.message }), { status: 500 });

  const { data: run } = await db.from("collection_runs").insert({ source_id: source.id, collector: "stackoverflow", status: "running" }).select("id").single();
  try {
    const fromdate = Math.floor((Date.now() - 7 * 86400_000) / 1000);
    const api = `https://api.stackexchange.com/2.3/questions?site=stackoverflow&pagesize=100&order=desc&sort=creation&fromdate=${fromdate}&filter=withbody`;
    const res = await fetch(api, { headers: { "User-Agent": "OpportunityRadar/1.2" } });
    if (!res.ok) throw new Error(`StackExchange ${res.status}`);
    const payload = await res.json();
    const signal = /(manual|manually|automation|workflow|alternative|workaround|pain|problem|struggle|tedious|slow|expensive|pricing|subscription|need to|how can i automate|is there a way)/i;
    const items = (payload.items || []).filter((q: any) => signal.test(`${q.title || ""} ${clean(q.body || "")}`)).slice(0, 40);

    let inserted = 0;
    for (const q of items) {
      const title = clean(q.title || "Untitled question");
      const body = clean(q.body || "");
      const url = q.link || `https://stackoverflow.com/questions/${q.question_id}`;
      const bytes = new TextEncoder().encode(`${title}|${body}|${url}`);
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const contentHash = Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
      const { data, error } = await db.from("raw_items").upsert({
        source_id: source.id,
        external_id: String(q.question_id),
        source_url: url,
        author: q.owner?.display_name || null,
        title,
        body,
        published_at: new Date((q.creation_date || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        raw_payload: { tags: q.tags || [], score: q.score || 0, answer_count: q.answer_count || 0, collector: "stackoverflow-v1.2" },
        content_hash: contentHash,
      }, { onConflict: "source_id,external_id", ignoreDuplicates: true }).select("id").maybeSingle();
      if (error) throw error;
      if (data?.id) inserted++;
    }

    if (run?.id) await db.from("collection_runs").update({ status: "success", finished_at: new Date().toISOString(), records_seen: items.length, records_inserted: inserted }).eq("id", run.id);
    await db.from("sources").update({ last_success_at: new Date().toISOString() }).eq("id", source.id);
    return new Response(JSON.stringify({ ok: true, seen: items.length, inserted, quotaRemaining: payload.quota_remaining }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (run?.id) await db.from("collection_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_text: error }).eq("id", run.id);
    return new Response(JSON.stringify({ ok: false, error }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
