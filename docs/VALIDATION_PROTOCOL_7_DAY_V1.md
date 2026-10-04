# 7-Day Validation Protocol V1

Date adopted: 2026-10-04

## Objective

Optimize for **decision-grade learning per 7 days**, not emails sent, leads collected, or replies counted.

A validation sprint must end with one of four decisions:

- **Continue** — evidence is improving and the next test is justified.
- **Pivot** — the pain may be real, but the ICP, framing, channel, or offer is wrong.
- **Archive** — the pain is too weak, too rare, too well served, unreachable, or not worth paying for.
- **Pilot** — a qualified prospect accepts a bounded real-world test; paid commitment is the preferred signal.

No new active validation track starts while three tracks are already active.

Current active portfolio:
- Bookkeeping client-chasing workflow
- Catalog / pre-PIM cleanup
- Agentic KV-cache persistence/control

---

## Entry gate

Do not start outreach for a new hypothesis unless the following are written down:

1. **Pain hypothesis** — one concrete recurring job/problem, not a broad market.
2. **Narrow ICP** — observable qualifiers that distinguish likely sufferers from generic companies.
3. **Independent evidence** — preferably two independent problem reports, or one strong paid workflow plus independent corroboration.
4. **Current workaround** — what users do today.
5. **Existing alternatives** — why the current solution may still be insufficient.
6. **Measurable outcome** — hours, latency, errors, failed imports, close delay, cost, etc.
7. **Tiny offer/test** — something we can deliver before building a SaaS.
8. **Stop condition** — evidence that would make us stop.

If the entry gate is weak, keep the lead in Research instead of starting outreach.

---

## Day 1 — Narrow ICP + testable offer

### Goal
Turn a promising problem into one falsifiable validation experiment.

### Actions
- Write one pain hypothesis.
- Define 3–5 hard ICP qualifiers.
- Define exclusions.
- Write one measurable outcome.
- Define one bounded offer or prototype.
- Build a list of **15 high-fit prospects**, prioritizing named people and relevant roles over generic mailboxes.
- Record why each prospect fits.

### Exit condition
At least 10 genuinely qualified and reachable prospects exist.

If not, mark **reachability risk** before doing more research.

---

## Day 2 — First contact batch

### Goal
Start a small, information-dense outreach experiment.

### Batch
Target **10–15 high-fit prospects**, not 50 generic companies.

Suggested mix where legitimate and practical:
- 8–10 personalized emails
- 3–5 manual professional/social messages
- optionally 1–3 public business phone/contact routes for highly relevant companies

Never automate a social platform in a way that violates its terms.

### Message rule

Do not lead with:

> “I am researching an idea. Can you tell me about your workflow?”

Lead with:
- a concrete observed pattern;
- one relevant fact about their company;
- one short question that can be answered quickly;
- optionally a useful benchmark/sample offer.

The first message should usually require less than one minute to answer.

---

## Day 3 — Move from interview request to value test

### Goal
Test behavior, not opinions.

Instead of only asking whether the problem exists, offer to solve a tiny part of it.

### Catalog
Ask for a 300–500 row anonymized sample.

Return:
- duplicate/variant findings;
- GTIN/UPC/EAN validation;
- unit/format inconsistencies;
- missing/ambiguous fields;
- import-risk flags;
- per-field or per-row audit/change log.

Do the first bounded sample free if needed to remove trust friction.

If useful, offer a larger **paid cleanup pilot**.

### Bookkeeping
Offer a one-close-cycle concierge experiment.

For one small subset of client accounts:
- maintain outstanding-item status;
- prepare reminder/follow-up drafts;
- show what is still blocking close;
- fit around the firm's current email/WhatsApp/CRM/portal rather than replacing everything.

The objective is to measure:
- follow-up touches;
- staff time;
- days to obtain missing items;
- close delay;
- whether they want the workflow again next month.

### KV-cache
Dogfood before relying on cold outreach.

Run a reproducible long-agent-session benchmark:
- cold context;
- warm prefix;
- forced eviction/restart;
- restored/persisted cache;
- cross-instance if feasible.

Measure:
- TTFT;
- tokens/context recomputed;
- cache-hit ratio;
- GPU/compute time;
- persistence/storage overhead;
- recovery/operator steps.

Do not pitch a product unless the benchmark reveals a meaningful gap after correct existing caching/offloading configuration.

---

## Day 4 — Decision point #1

Evaluate the first **15–20 highly qualified contacts**.

These are internal operating thresholds, not universal market benchmarks.

### 0 substantive replies
Do **not** send another 50.

Change at least one:
- ICP;
- role;
- pain framing;
- outreach channel;
- value offered;
- prospect quality.

### 1–2 substantive replies
Signal is weak or mixed.

Investigate:
- why the problem is minor;
- what existing tool solves it;
- whether the wrong person was contacted;
- whether the problem exists only at a different company scale.

### 3+ substantive replies
Continue the sprint.

Prioritize calls, samples and real tests over adding more top-of-funnel volume.

### Stronger behavioral signal
Any of these is more valuable than a positive opinion:
- prospect sends real/sample data;
- prospect books a call;
- prospect lets us test the workflow;
- prospect introduces the actual owner of the problem;
- prospect asks about price;
- prospect accepts a paid pilot.

Autoresponders and generic vendor replies do not count.

---

## Day 5 — Follow-up + discovery calls

Send **one short follow-up** to the original qualified nonresponders.

Do not recycle them indefinitely.

On calls, ask for concrete history rather than hypothetical preference:

- What happened the last time this problem occurred?
- How often does it happen?
- Who handles it?
- What tools/process are used now?
- How long does it take?
- What does an error/delay/recompute cost?
- What has already been tried?
- Why is the current workaround still tolerated?
- Who would approve spending on this?
- What would make a small pilot worth trying?

Avoid leading with the proposed product.

---

## Day 6 — Commitment test

Turn confirmed pain into a bounded offer.

The offer must state:
- exact input;
- exact output;
- duration;
- what is measured;
- price or explicit paid-pilot ask;
- clear limit to scope.

A reply such as “sounds useful” is **not validation**.

Evidence strength, from weak to strong:

interest → detailed workflow disclosure → sample/data shared → call/test accepted → price discussion → paid commitment → paid pilot completed → repeated usage.

The sprint should try to move at least one prospect beyond verbal interest.

---

## Day 7 — Decision review

Review each active hypothesis using the same scorecard.

### Continue
Normally requires:
- at least 3 substantive pain conversations/replies across 15–25 high-fit prospects;
- at least 2 people able to quantify time/cost/delay/error;
- at least 1 behavioral commitment such as sample, test, or pilot conversation.

### Pilot
A qualified prospect agrees to a bounded real-world test.

A paid commitment is preferred. Build promotion still requires the stronger thresholds in the existing Validation Playbook; one friendly pilot is not PMF.

### Pivot
Use when:
- people answer but the problem is different from the hypothesis;
- pain exists only in a narrower/larger ICP;
- the contact role is wrong;
- the current offer is too invasive;
- incumbents solve the broad problem but leave a smaller wedge.

Change **one major variable at a time** so the next sprint teaches something.

### Archive
Strong reasons include:
- 20–25 genuinely qualified prospects plus one follow-up produce no meaningful pain/test behavior;
- users consistently describe the issue as rare/minor;
- current tools solve it well enough;
- no reachable buyer owns the problem;
- the tiny offer is not worth trying even free/low-friction;
- a paid commitment remains absent after the track-specific stop limit.

Do not rescue an archived idea by simply adding another 100 generic contacts.

---

# Current track playbooks

## A. Bookkeeping — one final narrow sprint

### Status
Problem exists, but current evidence says pain varies sharply with firm scale.

### ICP
Prioritize firms with several of:
- 50–200+ recurring monthly clients;
- multiple bookkeepers/accountants;
- formal month-end close process;
- QBO/Xero;
- Dext/Hubdoc;
- Karbon/Financial Cents/CRM/client portal;
- recurring outstanding client questions/documents.

Avoid making solo/small practices the core sample unless they explicitly show heavy chasing.

### Contact roles
Owner / partner / bookkeeping manager / operations manager / client-success or workflow owner.

Avoid generic `info@` when a real owner can reasonably be identified.

### Hypothesis
At sufficient client volume, tracking and repeatedly chasing missing client items creates measurable close delay or staff work that existing practice-management tools do not eliminate.

### Tiny offer
Run one bounded missing-items workflow for one close cycle without replacing the firm's current stack.

### Stop
If another high-fit 15–25 scaled firms show weak pain and no one accepts a concrete workflow test, archive or substantially reformulate.

Maureen's small-practice / low-chasing case should be treated as useful counter-evidence, not a failure of the interview.

---

## B. Catalog / pre-PIM cleanup

### Status
Too early to judge current outreach. First batch was sent 2026-10-01 and had almost no business-day response window before the weekend.

### ICP
Require most of:
- 10k+ SKUs;
- multiple suppliers/feeds;
- multiple sales channels or downstream systems;
- PIM/ERP/marketplace imports;
- recurring normalization, identifier, variant, mapping, or rejection work.

### Contact roles
Product Data Manager / Catalog Manager / Catalog Operations / Ecommerce Operations / PIM Manager / owner of a smaller distributor.

Prefer named operational contacts over sales/info mailboxes.

### Hypothesis
Large multi-supplier catalogs pay repeatedly for pre-PIM/import cleanup when bad data creates manual review, rejected imports, rework or migration delay.

### Tiny offer
A 300–500 row audit with an import-risk report and audit trail.

### Stop
If 15–25 high-fit catalog operators produce no recurring pain, no sample sharing and no willingness to review a concrete audit, revise ICP/wedge before more volume.

---

## C. Agentic KV-cache

### Status
Technically promising, but market validation should not lead with cold outreach.

### ICP
Self-hosted teams with:
- long multi-turn agent sessions;
- roughly 50k+ token contexts;
- vLLM/LMCache/SGLang/oMLX or similar;
- multiple replicas/restarts/evictions;
- measurable TTFT/GPU/re-prefill cost.

### First test
Dogfood a real long coding-agent workload.

### Hypothesis
Some production teams still pay a material latency/compute/operational penalty when session cache state is lost or cannot follow an agent across lifecycle events after normal engine caching is correctly configured.

### Tiny product shape
Only after benchmark:
- deterministic session cache artifact;
- restore;
- cross-instance lookup;
- cache/session observability;
- lifecycle/retention controls.

### Stop
Archive/redefine if:
- standard vLLM/LMCache configuration solves the measured issue;
- persistence overhead erases the benefit;
- deployment boundaries prevent control;
- 8–12 qualified infra teams see no residual gap or paid interest.

---

# Sprint scorecard

Track these fields for every validation sprint:

| Metric | Count |
| --- | ---: |
| Qualified prospects | |
| Named decision/problem owners | |
| Contacted | |
| Delivered / non-bounced | |
| Substantive replies | |
| Pain confirmed | |
| Pain quantified | |
| Sample/data shared | |
| Calls booked | |
| Calls completed | |
| Tiny test accepted | |
| Pilot offered | |
| Paid pilot committed | |
| Pilot delivered | |
| Decision | Continue / Pivot / Archive / Pilot |

## Primary metric

**Decision-grade evidence produced per 7 days.**

Reply rate and outreach volume are diagnostic metrics, not the goal.

---

# Portfolio rule

Keep no more than **three active validation tracks**.

Current slots are full:
1. Bookkeeping
2. Catalog
3. KV-cache

Any new Opp Scan lead waits in Research/P1-P2 until one active track reaches Pilot/Build or Archive.

This prevents attractive new ideas from resetting the learning cycle before current hypotheses reach a decision.
