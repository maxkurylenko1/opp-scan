# Opportunity Radar V1

An evidence-first radar that collects public problem signals, groups them into repeatable problem clusters, scores commercial opportunities, and gives you a dashboard to decide what deserves deeper validation.

## What works in this scaffold

- Next.js App Router dashboard with demo mode.
- Supabase schema for sources, raw items, normalized signals, clusters, scores, evidence, competitors, experiments and weekly reports.
- Hacker News collector using the official Firebase API.
- GitHub issue search collector.
- AI signal extraction with strict structured output when `OPENAI_API_KEY` is present; deterministic heuristic fallback otherwise.
- Weekly optional web research for top clusters using the OpenAI Responses API web-search tool.
- Evidence-first score: Opportunity Score is separate from Confidence Score.
- Protected daily/weekly job endpoints that can be called by Supabase Cron.

## Quick start

1. Use Node.js 22+.
2. `npm install`
3. Copy `.env.example` to `.env.local`.
4. For demo UI only: `npm run dev` and open `http://localhost:3000`.
5. For persistent mode, create a Supabase project and run `supabase/migrations/001_core.sql`.
6. Add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
7. Add `OPENAI_API_KEY` for higher-quality extraction/research; without it the collector still works with heuristic extraction.
8. Run a daily collection locally:
   `curl -X POST http://localhost:3000/api/jobs/daily -H "Authorization: Bearer $CRON_SECRET"`
9. Run weekly ranking:
   `curl -X POST http://localhost:3000/api/jobs/weekly -H "Authorization: Bearer $CRON_SECRET"`
10. Deploy, then schedule those endpoints with `docs/supabase-cron.sql`.

## Scoring

`Opportunity Score = 20% pain + 20% willingness to pay + 15% reachability + 10% frequency + 10% growth/timing + 10% competitor gap + 10% buildability + 5% recurring revenue - penalties`

Confidence is separate and depends on source independence, money evidence, evidence quality and recency. Do not build from score alone; open the original evidence.

## V1 source strategy

Automate durable, low-maintenance sources first. V1 includes Hacker News and GitHub. Add Reddit/search, freelance jobs, marketplaces, changelogs and job boards through adapters after validating that the core signal-to-opportunity loop is useful. Avoid brittle scraping when an API or search layer can provide the same evidence.

## Security note

The service-role key stays server-side. Database RLS is enabled with no public policies. Job routes require `CRON_SECRET` in production.

## Deployed V1 backend

A production Supabase backend is now live with scheduled collection, SQL normalization, weekly ranking, and a token-protected read-only Edge dashboard. See `docs/DEPLOYED_V1.md`.
