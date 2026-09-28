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
   - Separate launch/competitor evidence from independent user-demand evidence.
   - Do not let Show HN/self-promotion raise buyer confidence.
   - Preserve launches as competitor/timing signals.

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
