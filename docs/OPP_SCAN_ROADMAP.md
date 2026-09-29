# Opportunity Radar source roadmap

Status updated: 2026-09-28

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
   - Product/platform changelogs and API releases.
   - Browser extension/app reviews.
   - Stronger freelance/job demand sources.
   - Prioritize sources that add independent pain, spend or timing evidence rather than raw volume.

## Guiding rule

Do not optimize for the largest number of signals. Optimize for independent evidence that improves a decision while keeping weak early ideas alive as Scouts.
