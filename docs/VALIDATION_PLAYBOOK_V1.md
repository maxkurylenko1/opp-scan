# Validation playbook V1

Date: 2026-09-30

This playbook applies only to Research Inbox leads explicitly marked **Validate**. It does not authorize outreach, scraping, purchases or contacting source authors. No interview, pilot or payment may be recorded unless it actually happened.

## Shared evidence rules

A valid interview/pilot actor must be independent from the original source author unless clearly labeled otherwise.

Do not count:
- a GitHub bot or automated issue;
- the same person across multiple issues/accounts;
- a vendor promoting its own product as buyer demand;
- a free trial signup as a paid commitment;
- “sounds useful” as willingness to pay.

A paid commitment means an independent actor voluntarily agrees to spend money for the bounded pilot after understanding what will be delivered.

---

## V1-A — High-volume catalog / UPC cleanup

### Hypothesis

Operators managing 10k–50k SKU catalogs across multiple channels will pay for an auditable pre-PIM cleanup workflow that reduces manual spreadsheet/script work while preserving a per-field change log and human review for uncertain values.

### ICP

Prioritize:
- e-commerce/catalog operations managers;
- PIM/data migration leads;
- marketplace operations teams;
- distributors/manufacturers with 10k–50k active SKUs;
- organizations publishing to at least 2–3 channels;
- teams still using CSV/Excel plus scripts or VAs for cleanup.

Strong qualification signals:
- GTIN/UPC/EAN errors;
- duplicate SKUs/variants;
- inconsistent units/currencies/categories;
- repeated supplier-feed normalization;
- marketplace import rejection;
- PIM migration blocked by source-data quality;
- 4+ hours per week of recurring manual cleanup.

Exclude for this test:
- catalogs under ~2k SKUs with no recurring pain;
- pure one-time data entry;
- businesses already satisfied with their PIM data-quality workflow;
- agencies trying to sell a competing cleanup service.

### Discovery sample

Target **10 independent qualified conversations**.

Minimum evidence to continue:
- 5/10 describe recurring cleanup pain;
- 3/10 can quantify time, error, delay or outsourcing cost;
- 3 provide an anonymized/sample export or reproducible schema example;
- at least 2 agree to a paid pilot after seeing a sample result.

### Interview questions

1. How many active SKUs and channels do you manage?
2. Where does product data originate?
3. What breaks most often before import/publication?
4. What happens today when a GTIN/UPC, unit, category or duplicate is wrong?
5. How many hours/people are involved in cleanup each week/month?
6. Which parts are scripted, manual, outsourced or handled by the PIM?
7. What have existing tools failed to solve?
8. What auditability/review is required before a change can be trusted?
9. What does a failed/bad import cost in time, rework or delayed launch?
10. If a tool returned an import-ready file plus a per-cell change log, what would have to be true for you to pay for it?

Avoid asking “Would you use this?” until after the current workflow and cost are understood.

### Pilot

Input:
- a bounded real catalog export;
- ideally 500–5,000 SKUs for the first paid pilot;
- explicit target schema/platform.

Deliver:
- duplicate/variant findings;
- GTIN/UPC validation;
- normalized units/currencies/dates;
- category/attribute mapping where deterministic;
- uncertain values flagged, never guessed;
- import-ready output;
- per-cell change log;
- reconciliation report.

Measure:
- manual hours before vs after;
- number of import-blocking errors;
- percentage auto-resolved vs flagged;
- reviewer correction rate;
- time to import-ready state.

### Success threshold

Continue toward Build only when:
- 2+ independent paid pilots complete;
- both buyers would use the workflow again or on another catalog/feed;
- measured effort or delay falls materially;
- reviewer correction rate is low enough that automation remains trustworthy;
- no incumbent workflow is clearly cheaper/easier for the same outcome.

### Failure / stop conditions

Stop or reframe if:
- fewer than 2 paid commitments after 15 strongly qualified prospects;
- buyers only want one-off consulting;
- existing PIM rules solve the same issue once configured;
- most value depends on manual enrichment that cannot be standardized;
- audit/review overhead eliminates the automation benefit.

---

## V1-B — Agentic KV-cache persistence / control

### Hypothesis

Teams self-hosting long-running agentic inference will pay for a managed operational layer that preserves/reuses expensive session prefixes across eviction, restart or instance movement when engine-managed cache behavior is insufficient.

### ICP

Prioritize:
- ML/inference platform engineers;
- teams serving vLLM, LMCache, SGLang, oMLX or similar;
- coding-agent / tool-agent workloads;
- sessions routinely above 50k tokens;
- multi-turn agents with high input:output ratios;
- workloads where cache loss creates measurable GPU cost or TTFT;
- multi-instance or restart/eviction scenarios.

Strong qualification signals:
- cache hit rate is an explicit operational metric;
- context re-prefill takes tens of seconds or minutes;
- cache capacity/eviction is a known bottleneck;
- cross-instance movement causes prefix recompute;
- engineers maintain custom cache/session scripts;
- expensive GPU capacity is reserved to protect cache locality.

Exclude:
- ordinary hosted API users with no control over inference/cache;
- short chat workloads;
- teams whose existing prefix cache fully solves the problem;
- research-only interest with no production workload.

### Discovery sample

Target **8 independent qualified engineering conversations**.

Minimum evidence to continue:
- 4/8 can show real cache-miss/recompute pain;
- 3 can quantify latency, GPU or token cost impact;
- 2 have tried custom workarounds beyond default prefix caching;
- at least 2 agree to a paid operational pilot after benchmark evidence.

### Interview questions

1. Which inference stack and models are you running?
2. Typical context length, turns/session and concurrent sessions?
3. Current cache strategy: HBM, CPU, SSD, distributed, provider-native?
4. What events cause expensive recomputation today?
5. How do you measure cache hit rate and TTFT?
6. Is the dominant problem capacity, TTL, serialization instability, restart or cross-instance placement?
7. What have you tried with vLLM/LMCache/SGLang/oMLX?
8. What remains operationally painful after those tools?
9. What is one hour/month of this problem worth in GPU cost or engineer time?
10. Would managed persistence/observability/orchestration be budgeted separately from the inference stack? Why or why not?

### Technical pilot

Before selling anything, reproduce the buyer’s baseline.

Benchmark:
- cold first turn;
- warm continuation;
- forced eviction;
- process/server restart;
- cross-instance continuation where relevant.

Record:
- TTFT;
- cache-hit tokens / hit ratio;
- recomputed prompt tokens;
- GPU utilization;
- storage/transfer overhead;
- operator steps required to recover/reuse a session.

Pilot scope should solve only the confirmed failure mode:
- deterministic per-session cache artifact;
- controlled restore;
- cross-instance lookup;
- cache observability/alerts;
- managed lifecycle/retention.

Do not claim a universal smarter eviction policy. Public real-trace work shows simple LRU can outperform more elaborate policies under some capacity-bound agent workloads.

### Success threshold

Continue toward Build only when:
- 2+ independent paid pilots commit;
- each has a reproducible production-like cache failure;
- the pilot reduces the buyer’s measured latency/cost/operational burden enough to matter;
- the value remains after comparing against correct configuration of vLLM/LMCache/SGLang/oMLX;
- there is a deployment boundary that a standalone product can actually control.

### Failure / stop conditions

Stop or reframe if:
- the problem disappears after normal prefix-cache configuration;
- open-source components solve it with minimal integration work;
- the relevant APIs do not expose enough control for a standalone layer;
- the economics are only meaningful at hyperscale customers unreachable by a small product;
- no paid commitment after 12 strongly qualified teams.

---

## Execution state

As of 2026-09-30:
- desk research: complete;
- target ICP definitions: complete;
- experiment design: complete;
- prospect list: not yet created;
- outreach: not authorized / not started;
- interviews: 0;
- paid commitments: 0;
- pilots delivered: 0.

The next legitimate step is prospect discovery and outreach preparation, followed by explicit authorization before any messages are sent.
