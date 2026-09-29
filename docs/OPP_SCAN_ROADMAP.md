# Opportunity Radar source roadmap

Status updated: 2026-09-29

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

## Guiding rule

Do not optimize for the largest number of signals. Optimize for independent evidence that improves a decision while keeping weak early ideas alive as Scouts.
