import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const BOARDS = [
  "projectdiscovery",
  "spaceandtimelabs",
  "highlight",
  "wreiske",
  "flydelabs",
  "lablab-ai",
  "coollabsio",
  "aqualinkorg",
];

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureSource() {
  const { data, error } = await supabase.from("sources").upsert({
    key: "algora",
    name: "Algora Bounties",
    kind: "marketplace",
    base_url: "https://algora.io",
    enabled: true,
  }, { onConflict: "key" }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

type Bounty = {
  issueUrl: string;
  issueRef: string;
  title: string;
  amount: number;
  board: string;
};

function parseBounties(html: string, board: string): Bounty[] {
  const results: Bounty[] = [];
  const anchor = /<a href="(https:\/\/github\.com\/[^\"]+\/issues\/\d+)"[^>]*class="[^"]*group\/issue[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchor)) {
    const issueUrl = match[1];
    const body = match[2] || "";
    const issueRef = decodeHtml(body.match(/<p[^>]*>\s*([^<]+#\d+)\s*<\/p>/i)?.[1] || "");
    const paragraphs = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => decodeHtml(m[1] || "")).filter(Boolean);
    const title = paragraphs.find((p) => p !== issueRef && !/^\d+\s+(months?|days?|hours?)\s+ago$/i.test(p)) || "Untitled bounty";
    const start = Math.max(0, (match.index || 0) - 1400);
    const before = html.slice(start, match.index || 0);
    const amounts = [...before.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)];
    const rawAmount = amounts.at(-1)?.[1];
    if (!rawAmount) continue;
    const amount = Number(rawAmount.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    results.push({ issueUrl, issueRef, title, amount, board });
  }
  return results;
}

Deno.serve(async () => {
  const sourceId = await ensureSource();
  const { data: run, error: runError } = await supabase.from("collection_runs")
    .insert({ source_id: sourceId, collector: "algora", status: "running" })
    .select("id").single();
  if (runError) return new Response(JSON.stringify({ ok: false, error: runError.message }), { status: 500, headers: { "Content-Type": "application/json" } });

  try {
    const all: Bounty[] = [];
    const boardStatus: Array<{ board: string; status: number; found: number }> = [];
    for (const board of BOARDS) {
      const url = `https://algora.io/${board}/bounties?status=open`;
      const res = await fetch(url, { headers: { "User-Agent": "OpportunityRadar/1.4" } });
      if (!res.ok) {
        boardStatus.push({ board, status: res.status, found: 0 });
        continue;
      }
      const html = await res.text();
      const parsed = parseBounties(html, board);
      all.push(...parsed);
      boardStatus.push({ board, status: res.status, found: parsed.length });
    }

    const unique = [...new Map(all.map((item) => [item.issueUrl, item])).values()];
    let inserted = 0;
    for (const item of unique) {
      const body = `Direct open-source bounty on Algora. Budget $${item.amount} USD. ${item.title}`;
      const contentHash = await sha256(`${item.issueUrl}|${item.title}|${item.amount}`);
      const { data, error } = await supabase.from("raw_items").upsert({
        source_id: sourceId,
        external_id: item.issueUrl,
        source_url: item.issueUrl,
        author: item.board,
        title: item.title,
        body,
        published_at: new Date().toISOString(),
        raw_payload: { board: item.board, issue_ref: item.issueRef, amount: item.amount, currency: "USD", algora_url: `https://algora.io/${item.board}/bounties?status=open` },
        content_hash: contentHash,
      }, { onConflict: "source_id,external_id", ignoreDuplicates: true }).select("id").maybeSingle();
      if (error) throw error;
      if (data?.id) inserted++;
    }

    await supabase.from("collection_runs").update({
      status: "success",
      finished_at: new Date().toISOString(),
      records_seen: unique.length,
      records_inserted: inserted,
    }).eq("id", run.id);
    await supabase.from("sources").update({ last_success_at: new Date().toISOString() }).eq("id", sourceId);

    return new Response(JSON.stringify({ ok: true, seen: unique.length, inserted, boards: boardStatus }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("collection_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_text: message }).eq("id", run.id);
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
