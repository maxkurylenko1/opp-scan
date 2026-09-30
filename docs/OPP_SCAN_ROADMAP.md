# Opportunity Radar source roadmap

Status updated: 2026-09-30

## Ordered plan

1. **Reddit approved OAuth / Data API access**
   - Status: IN PROGRESS / blocked on Reddit approval.
   - Collector is compliance-first: no unauthenticated JSON/RSS scraping.
   - Production marks Reddit as `blocked`, not failed, until approved credentials are configured.
   - After approval, configure `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` and optionally `REDDIT_SUBREDDITS`.
   - Validate real OAuth collection, source precision, retention/privacy behavior, and contribution to themes.

2. **Hacker News evidence split**
   - Status: COMPLETE (V2.5.2).
   - `Show HN` and promotional Ask HN posts are stored as `launch_competitor`, never as buyer demand.
   - Genuine Ask HN pain is stored as `problem_demand` and can survive as Scout evidence without purchase intent.
   - Generic HN stories are retained as `market_context`, not problem evidence.
   - HN money evidence now requires explicit product purchase/service-spend intent; arbitrary dollar/budget mentions do not count.
   - HN engagement can strengthen evidence quality but cannot convert a launch into demand.

3. **Algora value review**
   - Status: COMPLETE (V2.6).
   - Keep Algora, but only as low-weight `service_spend` corroboration.
   - Poll weekly instead of daily: 21 production runs yielded only 11 initial inserts and then no new records for the rest of the observed window.
   - Verify every bounty against the linked GitHub issue before using it; Algora's own open list was stale (8 of 12 observed “open” bounties were already closed on GitHub).
   - Use GitHub activity time instead of collector discovery time for evidence recency.
   - Bounties under $50 remain context only; they do not enter semantic matching.
   - Algora may strengthen an existing independently discovered cluster, but it cannot seed an Algora-only opportunity.

4. **Add missing high-value source classes**
   - Status: COMPLETE (V2.7).
   - Product/platform releases: LIVE. Official GitHub Releases API, stable releases by default, strong timing/deprecation/API/auth/security filters, max 3 relevant releases per repository. Stored as `market_context` only and never seeds a problem cluster.
   - Browser extension reviews: LIVE. Official Mozilla Add-ons v5 search + ratings APIs. Only 1–2★ reviews with text are considered; strong feature/workflow gaps become `problem_demand`, while regressions/product failures stay `market_context`.
   - Review author identities are not persisted.
   - Both collectors run daily before normalization.
   - Stronger freelance/job demand: LIVE via calibrated Freelancer v1.3.4. The collector now uses full buyer descriptions and classifies spend into `repeatable_workflow`, `custom_build`, and `generic_labor`; only repeatable workflows are actionable discovery evidence.
   - Generic job boards are intentionally not added at this stage: ordinary hiring proves staffing demand, not a reusable product gap, and would mostly add volume/noise.
   - Release notes and review failures may attach as `market_context` to an existing semantic problem cluster, but they can never seed a cluster themselves.
   - Status: COMPLETE for V2.7 source expansion; continue evaluating additional sources only when they add a genuinely new evidence class.

5. **Ranking and semantic-cluster hygiene**
   - Status: COMPLETE in V2.8.
   - Quarantine unversioned legacy GitHub evidence; only the demand-focused `github-demand-v1.3` corpus can participate in discovery.
   - Re-normalize Stack Overflow through the current strict product/service-intent gate.
   - Keep legacy Reddit evidence non-actionable while approved Reddit API access is blocked.
   - Semantic clustering is versioned to `semantic-v1.2`; low-similarity “same category + shared generic token” merges are removed.
   - Exact/theme ranking counts only actionable `problem_demand` and `service_spend` evidence.
   - Retired exact candidates get an explicit retired score version so stale rows cannot re-enter snapshots.
   - A current scan with zero surviving opportunities is shown as zero; the UI must not silently fall back to an older populated scan.

6. **Source precision, evidence independence and daily freshness**
   - Status: V2.9.
   - Exclude GitHub bot authors, multilingual scheduled digests, internal agent specs and competitor-research notes at collection and SQL-normalization time.
   - A copied Freelancer buyer brief with a different budget or posting ID is not a second independent paid-work signal.
   - Exact Scouts need independent corroboration (different source, different author or genuinely separate funded jobs), except a high-quality explicit purchase request that can remain an early single-signal Scout.
   - Preserve genuine HN usage-limit pain while rejecting quoted, unaffordable plan upgrades as purchase intent.
   - Reuse previously computed embeddings; increase daily pending batch modestly from 150 to 180.
   - Refresh the latest scan snapshot immediately after reclustering and ranking so the dashboard does not show yesterday's pre-cluster Top-5.

7. **Early Research: source-backed leads, separate from Opportunities**
   - Status: COMPLETE (V2.10).
   - Show a small, manually inspected list of original problem reports (Hacker News / Firefox reviews) while strict market-specific Top-5 may be empty.
   - Each lead is explicitly single-source and unvalidated, links to the original report, and has a concrete independent-corroboration question.
   - Only show a lead while its underlying signal remains actionable `problem_demand`; source reclassification removes it automatically.
   - Never convert the manually reviewed lead list into score, buyer confidence, cross-source count, outreach automation, or a claim of independently confirmed demand.
   - Broad cross-repository GitHub keyword searches were audited but produced mostly internal plans and tracking issues; do not import them as confirmations.

8. **Focused independent corroboration of Early Research**
   - Status: COMPLETE (V2.11 manual research review, 2026-09-30).
   - AI agent context handoff: original HN report plus independent user requests in CC Switch and T3 Code; CC Switch issue was closed as duplicate. An existing open-source handoff implementation is competitive supply, not buyer demand.
   - Agent access to a single Google Drive file: independent Claude connector report confirms the broader least-privilege concern for a different agent, but that GitHub issue was closed without a planned fix; re-check current connector scopes.
   - Firefox account-specific containers: a separate Mozilla user describes same-domain multiple-account routing friction. The report is historical, and Mozilla's native Firefox containers preview adds first-party competition.
   - K-1 bulk extraction: found related manual multistate K-1 entry and an existing extraction vendor, but neither independently confirms the original bulk-PDF workflow.
   - Stripe Link fraud: official 3DS liability-shift conditions are technical context, not a second independent Link-fraud incident.
   - Photo-to-editable-3D garden: an unrelated homeowner wants pool visualization, a related but non-identical workflow.
   - Clearly tag independent user reports vs adjacent needs / existing solutions / technical context, with original URLs and manual review date. Never feed these curated links into automated ranking, money evidence, or source-independent counts; no Reddit content is imported.

9. **Current product capabilities, competition and paid-demand validation**
   - Status: COMPLETE (V2.12 research audit, 2026-09-30); actual user trials/interviews/payments remain open.
   - Full sourced report: [Early Research market check](EARLY_RESEARCH_MARKET_CHECK_2026-09-30.md).
   - Agent handoff: VS Code already offers cross-harness handoff and MIT-licensed Claude/Codex skills cover CLI workflows; a narrower reliability/privacy gap remains hypothetical. No separate handoff willingness to pay verified.
   - Per-file AI/Drive access: Google supports `drive.file` + Picker; a historical Claude connector issue reports broader scopes, but today's per-connector OAuth behavior is not reproduced. No paid demand verified.
   - Firefox multi-account routing: native containers launched in Firefox 153 and the free Mozilla extension already supports multiple logins. An August 2026 MSP report identifies a narrower 30+ tenant navigation/routing workflow and includes an existing prototype. No paid demand verified.
   - For each lead: document existing alternatives, a reproducible test, affected-user interview criteria, a concrete paid-pilot test and a stop condition. Keep all findings outside automatic opportunity scores/ranking.

10. **Automatically maintained Early Research inbox**
   - Status: V2.13 — implemented; final production verification required after merge.
   - Introduce private research_leads / research_lead_refs tables with RLS, service-role access, original-source URLs, duplicate-safe anchor keys, manual notes, and status New → Research → Validate → Archived.
   - Seed the six previously inspected HN/Firefox leads as curated Research; propose up to 15 additional leads per day from already approved/sanitized HN, Firefox review and qualified repeatable paid Freelancer signals; cap unattended New backlog at 50.
   - Run the queue refresh daily at 06:05 UTC after the existing 05:00 source collectors and 05:20 semantic recluster; allow admin-only one-click refresh.
   - Search the existing embedded corpus for strictly subject-matched related complaints, separate paid service briefs, competitor launches and release context. Suggestions remain pending until an administrator opens the primary source and confirms relevance or dismisses the match.
   - A single paid freelance job is service-spend evidence, not proof of product willingness to pay. A launch/release is competition/timing context, not a second buyer. No new signal, cluster, ranking confidence, purchase-intent or independent-demand count is created by the research inbox.
   - Manual review supports reasoned archive, edits to notes/status, separate matching decisions; archived URLs are not automatically resurrected.
   - Never search Reddit while approved access is missing. V2.13 matching is limited to the already collected, legitimately available corpus and does not claim exhaustive external market or competitor research.

11. **External corroboration and existing-solution discovery**
   - Status: V2.14 — implementation and transaction tests; production verification after merge.
   - Official, read-only Hacker News Algolia Ask/Show and GitHub Issues Search APIs; no scraping and **no Reddit API** while access is refused.
   - Private `research_external_refs` and `research_external_search_runs` with RLS, service-role-only grants, unique per-lead original URLs, preserved manual dismissals and provider/cooldown audit.
   - Keep external research manual-only; an admin-triggered pass checks up to 4 eligible non-archived leads with max 12 official search requests, 10 source results each, up to 3 candidate links per search surface. Respect GitHub's rate limits, stop GitHub calls on a 403/429 response and do not retry in the same run.
   - Use narrow per-lead search queries (editable by admin) or derive from public original titles. Never send private notes, full imported documents or personal data to search services.
   - Require at least 2 overlapping query terms for a *suggestion*. Keep Show HN launches as potential competition and GitHub issues as potentially internal project reports, not automatic independent buyer confirmations.
   - Deduplicate original URL, manually curated references and existing `raw_items`. Confirming external relevance requires a human-written reason and never changes source normalization, rankings, evidence quality, product confidence or willingness-to-pay labels.
   - Successful per-lead searches cool down for 7 days; partial/provider failures can be retried after a day, never by bypassing provider limits. Archived leads are never searched.

## Guiding rule

Do not optimize for the largest number of signals. Optimize for independent evidence that improves a decision while keeping weak early ideas alive as Scouts.
