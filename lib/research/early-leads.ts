import { getAdminClient } from "@/lib/supabase/admin";

export type ResearchReference = {
  label: string;
  url: string;
  kind: "independent_report" | "related_workflow" | "existing_solution" | "technical_context";
  note: string;
};

export type ResearchMarketAudit = {
  reviewedAt: string;
  currentProductState: string;
  existingAlternatives: string;
  remainingGapHypothesis: string;
  willingnessToPay: "unverified";
  validationSteps: string[];
  stopCondition: string;
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
  marketAudit?: ResearchMarketAudit;
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
  audit?: ResearchMarketAudit;
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
    audit: {
      reviewedAt: "2026-09-30",
      currentProductState: "Google officially supports per-file OAuth via drive.file + Google Picker. A Claude connector user reported drive.readonly alongside drive.file in August; that issue closed as not planned/stale in September. The current token scopes for each Claude integration have NOT been independently reproduced.",
      existingAlternatives: "Google Picker with drive.file; direct user-selected files in Claude; existing Google Workspace permissions and organizational connector action controls. These do not establish that every connector can enforce an agent-specific per-file scope.",
      remainingGapHypothesis: "Teams may need an auditable, revocable per-file permission boundary across multiple AI agents, but only if their current connectors cannot enforce this and the problem recurs.",
      willingnessToPay: "unverified",
      validationSteps: [
        "With an authorized test account, compare OAuth scopes and file visibility of two current agent connectors. Never inspect another user's Drive without permission.",
        "Interview at least three security-conscious teams about actual blocked deployments, compliance requirements and current workarounds.",
        "Only test pricing after demonstrating a reproducible missing control; seek at least two real paid-pilot commitments rather than hypothetical interest."
      ],
      stopCondition: "Stop standalone-product research if modern connectors plus drive.file, Picker and existing admin controls already satisfy the scoped-file requirement, or if no qualified team commits to a paid pilot."
    },
    references: [
      {
        label: "Google: official drive.file and Picker guidance",
        url: "https://developers.google.com/workspace/drive/api/guides/api-specific-auth",
        kind: "technical_context",
        note: "Official Google-supported per-file permission mechanism. Its existence is not proof that any specific third-party agent connector implements it correctly.",
      },
      {
        label: "Claude: connector capabilities and file selection",
        url: "https://support.claude.com/en/articles/10166901-use-google-workspace-connectors",
        kind: "existing_solution",
        note: "Current Claude docs describe user-selected Google Drive files and source permissions; they do not establish the current OAuth scopes for every Claude surface.",
      },
      {
        label: "Claude: organizational connector action restrictions",
        url: "https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities",
        kind: "existing_solution",
        note: "Team/Enterprise owners can restrict connector actions such as read/write; this is not automatically a per-file OAuth boundary.",
      },
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
    audit: {
      reviewedAt: "2026-09-30",
      currentProductState: "CC Switch's original cross-tool handoff feature request remains open. T3 Code has a separate open provider-switch context-loss bug reproduced in v0.0.38 as of September 2. VS Code now documents cross-harness handoff with conversation history/context, so basic handoff is already available in at least one mainstream workflow.",
      existingAlternatives: "VS Code local session handoff to Claude/Codex; GitHub's Claude/Codex agent integration; MIT-licensed claude-codex-handoff and Claude-to-Codex /handoff tooling. These alternatives cover some workflows but do not prove lossless cross-app or CLI-to-CLI transfer.",
      remainingGapHypothesis: "A local, privacy-conscious handoff may be useful when an agent hits usage limits mid-task and the developer switches between standalone CLIs, preserving verified repository state, changed files, tests and next steps without fragile transcript replay.",
      willingnessToPay: "unverified",
      validationSteps: [
        "Reproduce Claude CLI to Codex CLI handoff on a realistic interrupted task, then compare against both free open-source tools and the VS Code built-in handoff.",
        "Interview at least five developers who actually switched agents during the past month; measure frequency, lost time and what their current workaround lacks.",
        "Only after a demonstrable reliability gap, ask for a concrete paid pilot and seek two paid commitments; subscriptions to coding agents do not count."
      ],
      stopCondition: "Stop if VS Code/native or MIT-licensed handoff tools preserve the required state reliably, or if experienced users prefer the free solution and no paid-pilot commitments appear."
    },
    references: [
      {
        label: "VS Code: built-in cross-agent handoff",
        url: "https://code.visualstudio.com/docs/agents/run/agent-harnesses",
        kind: "existing_solution",
        note: "Official VS Code docs describe continuing a local session with Copilot, Claude, Codex or Cloud while carrying history and context; this reduces the gap for VS Code users.",
      },
      {
        label: "Open-source: Claude ↔ Codex via HANDOFF.md",
        url: "https://github.com/zhpy2004/claude-codex-handoff",
        kind: "existing_solution",
        note: "MIT-licensed paired agent skills save/resume a git-friendly handoff document. No SaaS fee or proven paid demand.",
      },
      {
        label: "Open-source: Claude to Codex /handoff",
        url: "https://github.com/Amal-David/claude-to-codex",
        kind: "existing_solution",
        note: "MIT-licensed project packages active Claude context and launches or prepares Codex continuation; test its safety and fidelity before assuming a remaining gap.",
      },
      {
        label: "T3 Code: context loss on provider switch",
        url: "https://github.com/pingdotgg/t3code/issues/4766",
        kind: "related_workflow",
        note: "Open bug reproduced on T3 Code 0.0.38 in September. Switching two Claude provider instances is related but not identical to Claude → Codex handoff.",
      },
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
    audit: {
      reviewedAt: "2026-09-30",
      currentProductState: "Firefox 153 (July 21) introduced native containers, while Mozilla's free Multi-Account Containers add-on retains extra site-assignment features. An open August 2026 issue from an MSP managing 30+ tenant containers describes slow selection and wrong-account logins, and includes a working companion-extension prototype.",
      existingAlternatives: "Free Firefox native containers and Mozilla Multi-Account Containers; current site assignments, manual container tabs and a user-built companion prototype. Mozilla is actively expanding the first-party experience.",
      remainingGapHypothesis: "High-volume MSP and support teams may need faster account-specific container search, 'recently used on this site' and reliable tenant routing across shared Microsoft 365 sign-in domains. Ordinary multi-account isolation is already solved.",
      willingnessToPay: "unverified",
      validationSteps: [
        "Test current Firefox + latest Multi-Account Containers with 20+ simulated client tenants and compare navigation time against the existing companion prototype.",
        "Interview at least five MSP or support admins managing ten or more tenant logins, documenting wrong-account incidents and time lost.",
        "Offer a narrow managed-workflow pilot and seek at least two paid team commitments; a user's willingness to contribute an upstream PR is not willingness to pay."
      ],
      stopCondition: "Stop if first-party/extension updates or the freely available prototype solve tenant routing, or if target teams will not pay for workflow management beyond free container isolation."
    },
    references: [
      {
        label: "Mozilla: Firefox 153 native Containers preview",
        url: "https://blog.mozilla.org/en/firefox/firefox-containers-preview/",
        kind: "existing_solution",
        note: "Mozilla shipped native container isolation on July 21, 2026; some extension-only site-assignment features remain separate.",
      },
      {
        label: "Mozilla: Multi-Account Containers capabilities",
        url: "https://support.mozilla.org/en-US/kb/containers",
        kind: "existing_solution",
        note: "Free extension already supports signing into several accounts on one website and assigning sites to containers.",
      },
      {
        label: "MSP: 30+ containers, wrong-tenant sign-in",
        url: "https://github.com/mozilla/multi-account-containers/issues/2929",
        kind: "related_workflow",
        note: "Open 2026 report from an MSP with 30+ tenant containers; a prototype tests site-recent selection and faster navigation. This is a concrete adjacent power-user workflow, not proof of paid demand.",
      },
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
      ...(lead.audit ? { marketAudit: lead.audit } : {}),
    }];
  });

  return leads.sort((a, b) => b.independentReportCount - a.independentReportCount);
}
