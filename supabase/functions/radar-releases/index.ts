import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");

const DEFAULT_REPOS = [
  "supabase/supabase",
  "n8n-io/n8n",
  "vercel/next.js",
  "microsoft/playwright",
  "cloudflare/workers-sdk",
  "modelcontextprotocol/typescript-sdk",
  "openai/openai-node",
  "stripe/stripe-node",
];

function repositories() {
  return [...new Set((Deno.env.get("RELEASE_REPOS") || DEFAULT_REPOS.join(","))
    .split(",").map((x) => x.trim()).filter((x) => /^[^/]+\/[^/]+$/.test(x)))].slice(0, 20);
}

function clean(value: string | null | undefined) {
  return (value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[\x60*_>#~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureSource() {
  const { data, error } = await db.from("sources").upsert({
    key: "platform_releases",
    name: "Platform & API Releases",
    kind: "changelog",
    enabled: true,
    base_url: "https://github.com",
  }, { onConflict: "key" }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

function relevantRelease(text: string) {
  return /(breaking|deprecat|migration|new api|api |sdk|integration|support for|webhook|oauth|auth|billing|workflow|automation|agent|mcp|browser|extension|database|realtime|storage|deploy|serverless|edge|rate limit|permission|security|pricing)/i.test(text);
}

Deno.serve(async () => {
  const sourceId = await ensureSource();
  const { data: run, error: runError } = await db.from("collection_runs")
    .insert({ source_id: sourceId, collector: "platform_releases", status: "running", metadata: { collector_version: "releases-v1.0" } })
    .select("id").single();

  if (runError) return new Response(JSON.stringify({ ok: false, error: runError.message }), { status: 500 });

  try {
    const headers: Record<string,string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "OpportunityRadar-Releases/1.0",
    };
    if (GITHUB_TOKEN) headers.Authorization = "Bearer " + GITHUB_TOKEN;

    const since = Date.now() - 14 * 86400_000;
    let seen = 0;
    let inserted = 0;
    const repos: Array<{ repo: string; status: number; kept: number }> = [];

    for (const repo of repositories()) {
      const res = await fetch("https://api.github.com/repos/" + repo + "/releases?per_page=10", { headers });
      if (!res.ok) {
        repos.push({ repo, status: res.status, kept: 0 });
        continue;
      }

      const payload = await res.json();
      let kept = 0;
      for (const release of payload || []) {
        if (release.draft) continue;
        const publishedAt = release.published_at || release.created_at;
        if (!publishedAt || new Date(publishedAt).getTime() < since) continue;

        const name = clean(release.name || release.tag_name || "Release");
        const body = clean(release.body || "");
        const text = name + " " + body;
        if (!relevantRelease(text)) continue;

        seen++;
        kept++;
        const title = (repo + ": " + (name || release.tag_name)).slice(0, 300);
        const bodyText = body.slice(0, 6000);
        const url = release.html_url || ("https://github.com/" + repo + "/releases");
        const contentHash = await sha256(repo + "|" + release.id + "|" + title + "|" + bodyText);

        const { data, error } = await db.from("raw_items").upsert({
          source_id: sourceId,
          external_id: repo + ":" + release.id,
          source_url: url,
          author: null,
          title,
          body: bodyText,
          published_at: publishedAt,
          raw_payload: {
            repository: repo,
            tag_name: release.tag_name || null,
            prerelease: Boolean(release.prerelease),
            collector: "releases-v1.0",
            evidence_role: "market_context",
          },
          content_hash: contentHash,
        }, { onConflict: "source_id,external_id", ignoreDuplicates: true }).select("id").maybeSingle();

        if (error) throw error;
        if (data?.id) inserted++;
      }
      repos.push({ repo, status: res.status, kept });
    }

    await db.from("collection_runs").update({
      status: "success",
      finished_at: new Date().toISOString(),
      records_seen: seen,
      records_inserted: inserted,
      metadata: { collector_version: "releases-v1.0", repositories: repos, role: "market_context" },
    }).eq("id", run.id);
    await db.from("sources").update({ last_success_at: new Date().toISOString() }).eq("id", sourceId);

    return new Response(JSON.stringify({ ok: true, seen, inserted, repositories: repos }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.from("collection_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_text: error }).eq("id", run.id);
    return new Response(JSON.stringify({ ok: false, error }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
