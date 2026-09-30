import { getAdminClient } from "@/lib/supabase/admin";

export type ResearchReference = {
  label: string;
  url: string;
  kind: "independent_report" | "related_workflow" | "existing_solution" | "technical_context";
  note: string;
};

export type EarlyResearchLead = {
  id: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string | null;
  problem: string;
  nextCheck: string;
  independentReportCount: number;
  researchReferences: ResearchReference[];
  reviewedAt: string;
};

// Manually verified research as of 2026-09-30. These citations are research notes,
// not normalized signals: they do NOT enter problem clusters, confidence scores,
// purchase-intent or market ranking. One URL is one report at most.
const REVIEWED_LEADS: Array<{
  url: string;
  problem: string;
  nextCheck: string;
  sourceName: string;
  references: ResearchReference[];
}> = [
  {
    url: "https://news.ycombinator.com/item?id=49879648",
    problem: "Accountants review batches of K-1 forms manually to extract tax-return fields.",
    nextCheck: "Interview unrelated tax preparers handling 10–100+ K-1s; distinguish bulk PDF extraction from state-specific entry, and test against existing K-1 extraction products.",
    sourceName: "Hacker News",
    references: [
      {
        label: "TaxProTalk: K-1 entry in Drake",
        url: "https://www.taxprotalk.com/forums/viewtopic.php?p=278820",
        kind: "related_workflow",
        note: "Accountants describe cumbersome state-specific K-1 entry; this is related manual work, NOT independent proof of demand for bulk PDF extraction.",
      },
      {
        label: "Existing K-1 extraction product",
        url: "https://www.k1taxsoftware.com/k1-processing",
        kind: "existing_solution",
        note: "Vendor advertises bulk K-1 extraction. Competitive supply and vendor claims are not independent buyer reports.",
      },
    ],
  },
  {
    url: "https://news.ycombinator.com/item?id=49867620",
    problem: "An AI agent can require overly broad Google Drive permissions when a user only wants it to access one file.",
    nextCheck: "Reproduce file-scoped access with current Google Drive scopes in at least two agent connectors; ask affected teams if existing picker-scoped integrations solve this.",
    sourceName: "Hacker News",
    references: [
      {
        label: "Claude Code: overbroad Drive connector scope",
        url: "https://github.com/anthropics/claude-code/issues/86771",
        kind: "independent_report",
        note: "Different user reports drive.readonly requested alongside drive.file. Closed as not planned/stale on 2026-09-14; current behavior is unverified and the affected connector differs from the HN report.",
      },
    ],
  },
  {
    url: "https://news.ycombinator.com/item?id=49904074",
    problem: "Switching coding agents after usage limits can interrupt a task and lose its working context.",
    nextCheck: "Test existing handoff tools with a long Claude → Codex session after quota exhaustion; check portability, accuracy, private-state handling and whether users would pay.",
    sourceName: "Hacker News",
    references: [
      {
        label: "CC Switch: cross-tool session handoff",
        url: "https://github.com/farion1231/cc-switch/issues/5307",
        kind: "independent_report",
        note: "Another user requests a Claude → Codex handoff when usage/context limits are reached. The issue was closed as a duplicate, not proof the feature is absent today.",
      },
      {
        label: "T3 Code: provider switch with transcript",
        url: "https://github.com/pingdotgg/t3code/discussions/6757",
        kind: "independent_report",
        note: "Different author and commenters describe losing context when continuing a conversation with another model/provider, including quota-exhaustion cases.",
      },
      {
        label: "Existing Claude-to-Codex handoff",
        url: "https://github.com/Amal-David/claude-to-codex",
        kind: "existing_solution",
        note: "A public implementation already offers transcript-based handoff. Its presence shows supply, not buyer willingness to pay.",
      },
    ],
  },
  {
    url: "https://news.ycombinator.com/item?id=49839721",
    problem: "A merchant reports fraud losses involving Stripe Link despite having payment controls.",
    nextCheck: "Find another independent merchant with the same Stripe Link fraud/liability failure mode; verify chargeback settings and current 3DS liability-shift behavior.",
    sourceName: "Hacker News",
    references: [
      {
        label: "Stripe: 3DS liability-shift conditions",
        url: "https://support.stripe.com/questions/liability-shift-with-frictionless-flow-for-3d-secure-v2-%283ds2%29?locale=en-GB",
        kind: "technical_context",
        note: "Stripe documents cases where liability does not shift. This does not independently verify a second Stripe Link fraud incident.",
      },
    ],
  },
  {
    url: "https://addons.mozilla.org/firefox/addon/multi-account-containers/reviews/",
    problem: "Users need reliable, account-specific container selection for different logins on the same website.",
    nextCheck: "Reproduce the exact multi-account cookie and routing issue in current Firefox/native containers, then seek recent unrelated reports before proposing another extension.",
    sourceName: "Firefox Add-ons review",
    references: [
      {
        label: "Mozilla: same-domain multiple identities",
        url: "https://github.com/mozilla/multi-account-containers/discussions/2673",
        kind: "independent_report",
        note: "Another user describes trouble opening different accounts on identical site URLs because both open in the same container. Historical report; current behavior needs retesting.",
      },
      {
        label: "Mozilla: Firefox native containers preview",
        url: "https://blog.mozilla.org/en/firefox/firefox-containers-preview/",
        kind: "existing_solution",
        note: "Mozilla previewed native containers in Firefox 153 in 2026; account isolation already has first-party functionality and this raises competitive risk.",
      },
    ],
  },
  {
    url: "https://news.ycombinator.com/item?id=49896742",
    problem: "A user wants to turn photos of a garden into an editable 3D plan.",
    nextCheck: "Look for another first-person request for the exact photo-to-editable-3D workflow, and compare pricing and editability against established landscaping tools.",
    sourceName: "Hacker News",
    references: [
      {
        label: "Houzz: visualizing a pool in an existing yard",
        url: "https://www.houzz.com/discussions/6368317/is-there-a-free-app-or-website-to-visualize-a-pool-in-your-yard",
        kind: "related_workflow",
        note: "A different user wants to visualize a pool in their existing yard. Related need, but not an exact request for photo-derived, editable 3D garden reconstruction.",
      },
    ],
  },
];

export async function getEarlyResearchLeads(): Promise<EarlyResearchLead[]> {
  const db = getAdminClient();
  if (!db) return [];

  const { data: rawItems, error: rawError } = await db.from("raw_items")
    .select("id,title,source_url,published_at")
    .in("source_url", REVIEWED_LEADS.map((lead) => lead.url));
  if (rawError) throw rawError;
  if (!rawItems?.length) return [];

  const { data: validSignals, error: signalError } = await db.from("signals")
    .select("raw_item_id")
    .in("raw_item_id", rawItems.map((item) => item.id))
    .eq("is_actionable", true)
    .eq("evidence_role", "problem_demand");
  if (signalError) throw signalError;

  const validIds = new Set((validSignals || []).map((signal) => signal.raw_item_id));
  // An extension's review-list URL can point at multiple different reviews.
  // Always select an actual actionable problem-demand review; don't silently
  // replace it with a non-actionable review from the same listing URL.
  const current = new Map(rawItems
    .filter((item) => validIds.has(item.id))
    .map((item) => [item.source_url, item]));

  const leads = REVIEWED_LEADS.flatMap((lead) => {
    const item = current.get(lead.url);
    if (!item) return [];

    const independentReportCount = 1 + lead.references.filter(
      (reference) => reference.kind === "independent_report",
    ).length;

    return [{
      id: item.id,
      title: item.title,
      sourceName: lead.sourceName,
      sourceUrl: item.source_url,
      publishedAt: item.published_at,
      problem: lead.problem,
      nextCheck: lead.nextCheck,
      independentReportCount,
      researchReferences: lead.references,
      reviewedAt: "2026-09-30",
    }];
  });

  return leads.sort((a, b) => b.independentReportCount - a.independentReportCount);
}
