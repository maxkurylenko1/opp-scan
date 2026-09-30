# Early Research — Current market checks (2026-09-30)

This is a **manual current-capability and commercial-validation audit**, not a scored
Opportunity analysis. The original six primary reports remain in
`lib/research/early-leads.ts`. These notes do not create new `signals`,
`cluster_signals`, purchase-intent labels or market snapshots.

**Method:** official product documentation; current, directly attributable GitHub
issues; inspected open-source implementations. Issue status is a point-in-time
observation, not proof of the current installed version's behavior. Prices of
adjacent products do **not** establish willingness to pay for a separate solution.
No interviews, payments, test-account OAuth reviews or software reproduction
have yet been conducted.

## 1. Claude / Codex session handoff

**Original report:** [Ask HN: handling coding-agent usage limits](https://news.ycombinator.com/item?id=49904074).

**Current independent evidence.**
- [CC Switch #5305](https://github.com/farion1231/cc-switch/issues/5305)
  requests cross-tool session handoff after a context/usage limit. It was still
  open when inspected on September 30; [#5307](https://github.com/farion1231/cc-switch/issues/5307)
  is a duplicate by the same author and must **not** count as a second buyer.
- [T3 Code #4766](https://github.com/pingdotgg/t3code/issues/4766)
  describes lost Claude-native context when switching compatible Claude provider
  instances after session shutdown, reproduced on v0.0.38 September 2. This is
  an adjacent failure, not proof of broken Claude → Codex switching.

**Current alternatives.**
- [VS Code session handoff](https://code.visualstudio.com/docs/agents/run/agent-harnesses)
  already documents local-session handoff across Copilot/Claude/Codex with
  history and context. It does not promise to resume an unrelated CLI's private
  process state.
- [claude-codex-handoff](https://github.com/zhpy2004/claude-codex-handoff)
  is MIT-licensed; it exchanges `HANDOFF.md` between agent skills, without
  sharing private native session formats or auto-running a target CLI.
- [Claude to Codex](https://github.com/Amal-David/claude-to-codex)
  is MIT-licensed and exports session context for a Codex continuation.

**Remaining testable gap:** reliable, safe *standalone CLI → standalone CLI*
continuation when quota/context exhaustion interrupts work, including repository
state, uncommitted changes, test results, permission boundaries and next action.

**Willingness to pay:** UNVERIFIED. Paying for Claude/Codex/Copilot does not prove
willingness to pay extra for this workflow. No paid handoff commitment observed.

**Validation experiment:** reproduce three interrupted Claude CLI → Codex CLI
handoffs on a realistic repository; compare state accuracy and user effort
against VS Code and both open-source tools; interview five developers who
actually switched tools in the last month; seek two real, voluntary paid pilot
commitments *after* identifying a demonstrable unresolved gap. Do not fabricate
trial results or presume that a paid product is necessary.

**Stop condition:** existing tools meet the required fidelity/usability, or
affected developers have no real paid-pilot interest.

## 2. Per-file access for AI agents using Google Drive

**Original report:** [Ask HN: least-privilege cloud-file access](https://news.ycombinator.com/item?id=49867620).

**Independent report:** [Claude connector issue #86771](https://github.com/anthropics/claude-code/issues/86771)
describes the author observing `drive.readonly` in addition to `drive.file` in
their consent/token flow in August 2026. It was closed as not planned/stale in
September. **We have not reproduced its current behavior**, and another app
may use different scopes.

**Current documented solutions and boundary.**
- [Google recommends `drive.file` + Picker](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
  for per-file app authorization. `drive.readonly` grants much wider read
  access. [Google Picker docs](https://developers.google.com/workspace/drive/picker/guides/overview)
  describe file selection with narrow consent.
- [Claude Google Workspace connectors](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors)
  let users choose Drive files and mirror their source permissions. That UI
  alone does not establish the precise OAuth scopes used by every connector.
- [Claude Team/Enterprise controls](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities)
  can restrict connector actions (e.g. writes) organization-wide; action
  permissions and file-level OAuth reach are **different controls**.

**Remaining testable gap:** auditable, revocable per-file access across multiple
agent connectors, *only if* current connectors demonstrably request unnecessary
Drive scope and existing Google Picker/admin controls do not solve it.

**Willingness to pay:** UNVERIFIED. Neither a privacy complaint nor paid AI
subscriptions imply a team budget for an additional permission product.

**Validation experiment:** with authorized sandbox accounts, inspect actual
requested OAuth scopes and attempt out-of-scope file reads in at least two
current agent connectors; discuss blocked deployments and policy requirements
with three security-conscious teams; request two paid pilot commitments only
after proving the gap and addressing handling of sensitive files.

**Stop condition:** current app-scoped Google permissions and connector admin
features are sufficient, or teams do not commit to a paid pilot.

## 3. High-volume Firefox container/account routing

**Original report:** [Multi-Account Containers review](https://addons.mozilla.org/firefox/addon/multi-account-containers/reviews/)
describing failed isolation for accounts on different servers of the same site.
The listing URL hosts many reviews: only the stored actionable review is used
by the Early Research source check.

**Independent current and historical reports.**
- [Mozilla issue #2929](https://github.com/mozilla/multi-account-containers/issues/2929),
  opened August 20, 2026 and still open on review, is from an MSP with 30+
  Microsoft 365 tenant containers. The author describes the time spent locating
  the correct account on a shared login domain, wrong-container logins and a
  working companion-extension prototype. This is **adjacent power-user
  evidence**, not an exact duplicate of the original review or evidence of a
  paid customer.
- [Mozilla discussion #2673](https://github.com/mozilla/multi-account-containers/discussions/2673)
  describes separate accounts on identical website URLs. It is historical,
  so today's behavior remains unverified.
- [Mozilla issue #2789](https://github.com/mozilla/multi-account-containers/issues/2789)
  describes a manual “open in container” override conflicting with the default
  site rule. This is related routing friction.

**Current alternatives.**
- [Firefox 153 native Containers](https://blog.mozilla.org/en/firefox/firefox-containers-preview/)
  shipped July 21, 2026. Mozilla says some add-on features remain outside the
  initial native implementation and development continues.
- [Mozilla Multi-Account Containers](https://support.mozilla.org/en-US/kb/containers)
  already provides multiple website logins and site assignment as a free
  browser extension. A companion prototype already exists for the specific
  MSP workflow.

**Remaining testable gap:** multi-tenant MSP workflows with 20–30+ accounts:
fast site-recent selection, tenant search and deterministic selection for shared
identity providers. *General cookie isolation is already available for free.*

**Willingness to pay:** UNVERIFIED. Offering to contribute an upstream patch or
building a prototype is evidence of effort, not a paid purchase.

**Validation experiment:** reproduce current Firefox/extension behavior with
20+ simulated tenant accounts (no customer credentials); compare task time,
misroutes and wrong-account login count against the author's prototype;
interview five MSP/support admins with >=10 active tenant logins; only then
seek two paid team pilot commitments for additional managed workflow features.

**Stop condition:** Mozilla/available free extensions already solve routing or
MSPs do not pay for anything beyond free container isolation.

## Integrity rules

- Do not label any of the three as product/market fit or verified willingness to
  pay. All remain Early Research, and the US/EU Top-5 evidence gates are unchanged.
- An historical issue, a duplicate, an adjacent workflow, a product page and a
  customer purchase are five different evidence types.
- A single person opening several issues, or their own prototype, is **one**
  independent actor; do not manufacture independent demand units.
- Do not connect to anyone's Drive or contact GitHub issue authors without the
  appropriate permission; these are proposed validation experiments, not
  completed interviews or authorized outreach.
