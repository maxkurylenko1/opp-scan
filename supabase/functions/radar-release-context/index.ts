import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession:false } },
);

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const DEFAULT_REPOS = [
  "supabase/supabase",
  "vercel/next.js",
  "n8n-io/n8n",
  "openai/openai-node",
  "anthropics/anthropic-sdk-typescript",
  "stripe/stripe-node",
  "modelcontextprotocol/typescript-sdk",
];

function repos() {
  return [...new Set((Deno.env.get("RADAR_RELEASE_REPOS") || DEFAULT_REPOS.join(","))
    .split(",").map((x) => x.trim()).filter(Boolean))].slice(0,20);
}

function relevant(text:string) {
  return /(api|sdk|integration|workflow|automation|agent|mcp|auth|oauth|webhook|realtime|database|storage|billing|payment|browser|extension|migration|breaking|support for|added|introduc|new feature|tool|function calling|streaming|embedding|search|deploy|edge|queue|cron)/i.test(text);
}

async function sha256(input:string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b)=>b.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async () => {
  const { data:source,error:sourceError } = await db.from("sources").upsert({
    key:"platform_releases",
    name:"Platform & API Releases",
    kind:"changelog",
    enabled:true,
    base_url:"https://github.com",
  }, { onConflict:"key" }).select("id").single();

  if (sourceError) return new Response(JSON.stringify({ ok:false,error:sourceError.message }), { status:500 });

  const { data:run } = await db.from("collection_runs")
    .insert({ source_id:source.id, collector:"platform_releases", status:"running", metadata:{ collector_version:"platform-releases-v1.0" } })
    .select("id").single();

  try {
    const headers:Record<string,string> = {
      Accept:"application/vnd.github+json",
      "User-Agent":"OpportunityRadar-Releases/1.0",
      "X-GitHub-Api-Version":"2022-11-28",
    };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

    const cutoff = Date.now() - 21 * 86400_000;
    const rows:any[] = [];
    const repoStats:any[] = [];

    for (const repo of repos()) {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=8`, { headers });
      if (!res.ok) {
        repoStats.push({ repo,status:res.status,accepted:0 });
        continue;
      }

      const payload = await res.json();
      let accepted = 0;
      for (const rel of payload || []) {
        if (rel.draft) continue;
        const when = Date.parse(rel.published_at || rel.created_at || "");
        if (!Number.isFinite(when) || when < cutoff) continue;
        const body = String(rel.body || "").replace(/\r/g,"").trim();
        const text = `${rel.name || ""} ${rel.tag_name || ""} ${body}`;
        if (!relevant(text)) continue;

        rows.push({ repo,rel,body,publishedAt:new Date(when).toISOString() });
        accepted++;
        if (accepted >= 4) break;
      }
      repoStats.push({ repo,status:res.status,accepted });
    }

    let inserted = 0;
    for (const row of rows) {
      const rel = row.rel;
      const title = `${row.repo}: ${rel.name || rel.tag_name || "release"}`;
      const body = row.body.slice(0,5000);
      const externalId = `${row.repo}#${rel.id}`;
      const contentHash = await sha256(`${externalId}|${rel.tag_name || ""}|${body}`);

      const { data,error } = await db.from("raw_items").upsert({
        source_id:source.id,
        external_id:externalId,
        source_url:rel.html_url,
        author:row.repo,
        title,
        body,
        published_at:row.publishedAt,
        raw_payload:{
          collector:"platform-releases-v1.0",
          evidence_role:"market_context",
          repo:row.repo,
          tag_name:rel.tag_name || null,
          prerelease:Boolean(rel.prerelease),
          github_release_id:rel.id,
        },
        content_hash:contentHash,
      }, { onConflict:"source_id,external_id", ignoreDuplicates:true }).select("id").maybeSingle();

      if (error) throw error;
      if (data?.id) inserted++;
    }

    if (run?.id) await db.from("collection_runs").update({
      status:"success", finished_at:new Date().toISOString(),
      records_seen:rows.length, records_inserted:inserted,
      metadata:{ collector_version:"platform-releases-v1.0", repositories:repoStats, window_days:21 },
    }).eq("id",run.id);

    await db.from("sources").update({ last_success_at:new Date().toISOString() }).eq("id",source.id);

    return new Response(JSON.stringify({ ok:true,seen:rows.length,inserted,repositories:repoStats }), {
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
