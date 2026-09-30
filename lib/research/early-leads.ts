import { getAdminClient } from "@/lib/supabase/admin";

export type EarlyResearchLead = {
  id: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string | null;
  problem: string;
  nextCheck: string;
  evidenceCount: 1;
  independentConfirmation: false;
};

// Deliberately small, manually inspected, original-source signals.
// These are questions for research, not scored Opportunities or proof of demand.
const REVIEWED_LEADS = [
  {
    url: "https://news.ycombinator.com/item?id=49879648",
    problem: "Accountants review batches of K-1 forms manually to extract tax-return fields.",
    nextCheck: "Find unrelated accounting firms reporting the same workflow; verify volume, error tolerance and existing paid solutions.",
    sourceName: "Hacker News",
  },
  {
    url: "https://news.ycombinator.com/item?id=49867620",
    problem: "Giving an AI agent access to one Drive file can require broader permissions or an insecure public link.",
    nextCheck: "Check current file-scoped permission options and look for independent teams reporting this exact limitation.",
    sourceName: "Hacker News",
  },
  {
    url: "https://news.ycombinator.com/item?id=49904074",
    problem: "Switching coding agents after usage limits can interrupt a task and lose context.",
    nextCheck: "Find independent developers with this workflow; verify how often they switch and what existing handoff tools already solve.",
    sourceName: "Hacker News",
  },
  {
    url: "https://news.ycombinator.com/item?id=49839721",
    problem: "A merchant reports fraud losses involving Stripe Link despite having payment controls.",
    nextCheck: "Check Stripe's documented liability and fraud controls, then seek unrelated merchants describing the same failure mode.",
    sourceName: "Hacker News",
  },
  {
    url: "https://addons.mozilla.org/firefox/addon/multi-account-containers/reviews/",
    problem: "A reviewer needs separate accounts on two servers of the same site without session-cookie collisions.",
    nextCheck: "Verify the browser's cookie-isolation behavior and collect recent, independent reports before treating this as a broader gap.",
    sourceName: "Firefox Add-ons review",
  },
  {
    url: "https://news.ycombinator.com/item?id=49896742",
    problem: "A user wants to turn photos of a garden into an editable 3D plan.",
    nextCheck: "Compare existing garden-planning apps and ask prospective users about the specific editing workflow and willingness to pay.",
    sourceName: "Hacker News",
  },
] as const;

export async function getEarlyResearchLeads(): Promise<EarlyResearchLead[]> {
  const db = getAdminClient();
  if (!db) return [];

  const { data: rawItems, error: rawError } = await db.from("raw_items")
    .select("id,title,source_url,published_at")
    .in("source_url", REVIEWED_LEADS.map((lead) => lead.url));
  if (rawError) throw rawError;
  if (!rawItems?.length) return [];

  // If a source gets downgraded by the normalizer, remove it from this queue.
  const { data: validSignals, error: signalError } = await db.from("signals")
    .select("raw_item_id")
    .in("raw_item_id", rawItems.map((item) => item.id))
    .eq("is_actionable", true)
    .eq("evidence_role", "problem_demand");
  if (signalError) throw signalError;

  const validIds = new Set((validSignals || []).map((signal) => signal.raw_item_id));
  const current = new Map(rawItems
    .filter((item) => validIds.has(item.id))
    .map((item) => [item.source_url, item]));

  return REVIEWED_LEADS.flatMap((lead) => {
    const item = current.get(lead.url);
    if (!item) return [];
    return [{
      id: item.id,
      title: item.title,
      sourceName: lead.sourceName,
      sourceUrl: item.source_url,
      publishedAt: item.published_at,
      problem: lead.problem,
      nextCheck: lead.nextCheck,
      evidenceCount: 1 as const,
      independentConfirmation: false as const,
    }];
  });
}
