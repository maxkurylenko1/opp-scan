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
   - Measure freshness, unique evidence contribution and overlap with GitHub/freelance sources.
   - Reduce weight or disable if it rarely adds independent opportunity evidence.

4. **Add missing high-value source classes**
   - Product/platform changelogs and API releases.
   - Browser extension/app reviews.
   - Stronger freelance/job demand sources.
   - Prioritize sources that add independent pain, spend or timing evidence rather than raw volume.

## Guiding rule

Do not optimize for the largest number of signals. Optimize for independent evidence that improves a decision while keeping weak early ideas alive as Scouts.
