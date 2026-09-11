# Deployed V1

Production backend is hosted in Supabase project `opportunity-radar` (`eu-central-1`).

Current production flow:

- Daily public-source collection from GitHub and Hacker News.
- Raw item storage with source-level deduplication.
- SQL/heuristic normalization into signals.
- Problem cluster assignment.
- Weekly 0–100 Opportunity Score and separate Confidence Score.
- Weekly report generation.
- Read-only Edge dashboard for operational inspection.

The current dataset should be treated as reconnaissance. Low-confidence clusters are intentionally not promoted to validation until independent evidence accumulates.
