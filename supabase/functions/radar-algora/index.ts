import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const DEFAULT_BOARDS = [
  "projectdiscovery",
  "spaceandtimelabs",
  "highlight",
  "wreiske",
  "flydelabs",
  "lablab-ai",
  "coollabsio",
  "aqualinkorg",
  "terrastruct",
];

function boards() {
  return [...new Set((Deno.env.get("ALGORA_BOARDS") || DEFAULT_BOARDS.join(","))
    .split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 30);
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ").trim();
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureSource() {
  const { data, error } = await supabase.from("sources").upsert({
    key: "algora", name: "Algora Bounties", kind: "marketplace",
    base_url: "https://algora.io", enabled: true,
  }, { onConflict: "key" }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

type Bounty = { issueUrl: string; issueRef: string; title: string; amount: number; board: string };
type GithubIssue = {
  title?: string; state?: string; created_at?: string; updated_at?: string; closed_at?: string | null;
  comments?: number; labels?: Array<{ name?: string }>; pull_request?: unknown;
};

function parseBounties(html: string, board: string): Bounty[] {
  const results: Bounty[] = [];
  const anchor = /<a href="(https:\/\/github\.com\/[^\"]+\/issues\/\d+)"[^>]*class="[^"]*group\/issue[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchor)) {
    const issueUrl = match[1];
    const block = match[2] || "";
    const issueRef = decodeHtml(block.match(/<p[^>]*>\s*([^<]+#\d+)\s*<\/p>/i)?.[1] || "");
    const paragraphs = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => decodeHtml(m[1] || "")).filter(Boolean);
    const title = paragraphs.find((p) => p !== issueRef && !/^\d+\s+(months?|days?|hours?)\s+ago$/i.test(p)) || "Untitled bounty";
    const before = html.slice(Math.max(0, (match.index || 0) - 1400), match.index || 0);
    const amounts = [...before.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)];
    const rawAmount = amounts.at(-1)?.[1];
    if (!rawAmount) continue;
    const amount = Number(rawAmount.replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) results.push({ issueUrl, issueRef, title, amount, board });
  }
  return results;
}

function parseGithubIssueUrl(url: string) {
  const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/i);
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}

async function fetchGithubIssue(issueUrl: string): Promise<{ issue: GithubIssue | null; status: number }> {
  const parsed = parseGithubIssueUrl(issueUrl);
  if (!parsed) return { issue: null, status: 0 };
  const headers: Record<string,string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "OpportunityRadar-Algora/2.0",
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/issues/${parsed.number}`,
    { headers, redirect: "follow" },
  );
  if (!res.ok) return { issue: null, status: res.status };
  const issue = await res.json() as GithubIssue;
  if (issue.pull_request) return { issue: null, status: 422 };
  return { issue, status: res.status };
}

async function deactivateExisting(sourceId: string, externalId: string, githubState: string, verifiedAt: string) {
  const { data: raw } = await supabase.from("raw_items")
    .select("id,raw_payload").eq("source_id", sourceId).eq("external_id", externalId).maybeSingle();
  if (!raw?.id) return;

  await supabase.from("raw_items").update({
    fetched_at: verifiedAt,
    raw_payload: {
      ...(raw.raw_payload || {}), collector: "algora-v2.0", collector_active: false,
      github_state: githubState, github_verified_at: verifiedAt,
    },
  }).eq("id", raw.id);

  const { data: signal } = await supabase.from("signals").update({
    is_actionable: false, evidence_role: "service_spend", money_signal_type: "bounty",
    purchase_intent_score: 4, evidence_quality_score: 4, extraction_version: "algora-service-v2.0",
  }).eq("raw_item_id", raw.id).select("id").maybeSingle();

  if (signal?.id) {
    await supabase.from("cluster_signals").delete()
      .eq("signal_id", signal.id).eq("assignment_method", "semantic-v1.1");
  }
}

Deno.serve(async () => {
  const sourceId = await ensureSource();
  const { data: run, error: runError } = await supabase.from("collection_runs")
    .insert({ source_id: sourceId, collector: "algora", status: "running", metadata: { collector_version: "algora-v2.0" } })
    .select("id").single();

  if (runError) return new Response(JSON.stringify({ ok: false, error: runError.message }), {
    status: 500, headers: { "Content-Type": "application/json" },
  });

  try {
    const all: Bounty[] = [];
    const boardStatus: Array<{ board: string; status: number; found: number }> = [];

    for (const board of boards()) {
      const url = `https://algora.io/${board}/bounties?status=open`;
      const res = await fetch(url, { headers: { "User-Agent": "OpportunityRadar/2.0" } });
      if (!res.ok) {
        boardStatus.push({ board, status: res.status, found: 0 });
        continue;
      }
      const parsed = parseBounties(await res.text(), board);
      all.push(...parsed);
      boardStatus.push({ board, status: res.status, found: parsed.length });
    }

    const unique = [...new Map(all.map((item) => [item.issueUrl, item])).values()];
    let inserted = 0, verifiedOpen = 0, closed = 0, unverified = 0, lowValue = 0;

    for (const item of unique) {
      const verifiedAt = new Date().toISOString();
      const { issue, status } = await fetchGithubIssue(item.issueUrl);
      if (!issue) { unverified++; continue; }

      if (issue.state !== "open") {
        closed++;
        await deactivateExisting(sourceId, item.issueUrl, issue.state || "closed", verifiedAt);
        continue;
      }

      verifiedOpen++;
      if (item.amount < 50) lowValue++;

      const canonicalTitle = issue.title || item.title;
      const evidenceAt = issue.updated_at || issue.created_at || verifiedAt;
      const body = [
        `Verified open-source bounty on Algora. Reward $${item.amount} USD.`,
        canonicalTitle,
        issue.comments != null ? `GitHub comments: ${issue.comments}.` : null,
      ].filter(Boolean).join(" ");
      const contentHash = await sha256(`${item.issueUrl}|${canonicalTitle}|${item.amount}|${issue.state}|${issue.updated_at || ""}`);
      const payload = {
        board: item.board, issue_ref: item.issueRef, amount: item.amount, currency: "USD",
        algora_url: `https://algora.io/${item.board}/bounties?status=open`,
        collector: "algora-v2.0", collector_active: true,
        github_state: issue.state, github_created_at: issue.created_at || null,
        github_updated_at: issue.updated_at || null, github_closed_at: issue.closed_at || null,
        github_comments: issue.comments || 0,
        github_labels: (issue.labels || []).map((x) => x.name).filter(Boolean),
        github_verified_at: verifiedAt, github_http_status: status,
      };

      const { data: existing } = await supabase.from("raw_items").select("id")
        .eq("source_id", sourceId).eq("external_id", item.issueUrl).maybeSingle();

      if (existing?.id) {
        await supabase.from("raw_items").update({
          source_url: item.issueUrl, author: item.board, title: canonicalTitle, body,
          published_at: evidenceAt, fetched_at: verifiedAt, raw_payload: payload, content_hash: contentHash,
        }).eq("id", existing.id);

        await supabase.from("signals").update({
          published_at: evidenceAt, evidence_role: "service_spend", money_signal_type: "bounty",
          money_amount: item.amount, money_currency: "USD",
          purchase_intent_score: item.amount >= 500 ? 6 : item.amount >= 100 ? 5 : 4,
          evidence_quality_score: item.amount >= 100 ? 5 : 4,
          is_actionable: item.amount >= 50,
          extraction_version: "algora-service-v2.0",
        }).eq("raw_item_id", existing.id);
      } else {
        const { data, error } = await supabase.from("raw_items").insert({
          source_id: sourceId, external_id: item.issueUrl, source_url: item.issueUrl,
          author: item.board, title: canonicalTitle, body, published_at: evidenceAt,
          fetched_at: verifiedAt, raw_payload: payload, content_hash: contentHash,
        }).select("id").maybeSingle();
        if (error) throw error;
        if (data?.id) inserted++;
      }
    }

    await supabase.from("collection_runs").update({
      status: "success", finished_at: new Date().toISOString(),
      records_seen: unique.length, records_inserted: inserted,
      metadata: {
        collector_version: "algora-v2.0", boards: boardStatus,
        verified_open: verifiedOpen, github_closed: closed, github_unverified: unverified,
        low_value_under_50: lowValue, role: "service_spend_corroboration",
      },
    }).eq("id", run.id);

    await supabase.from("sources").update({ last_success_at: new Date().toISOString() }).eq("id", sourceId);

    return new Response(JSON.stringify({
      ok: true, seen: unique.length, inserted, verifiedOpen, closed, unverified, lowValue, boards: boardStatus,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("collection_runs").update({
      status: "failed", finished_at: new Date().toISOString(), error_text: message,
    }).eq("id", run.id);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
