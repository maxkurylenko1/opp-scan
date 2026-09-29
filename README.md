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

Confidence is deliberately split into two dimensions:

- **Problem confidence** — is the painful workflow real, repeated, recent, and independently observed?
- **Product confidence** — is there evidence for this specific product-shaped solution: direct product purchase intent, an actual competitor gap, independent demand evidence, and no overwhelming incumbent/counter-evidence?

The UI still exposes an overall confidence summary, but promotion decisions use the two dimensions separately. Service/freelancer spend proves that a problem costs money; it does **not** by itself prove recurring SaaS demand.

### Evidence maturity gates

- **Scout** — promising early evidence. Keep it visible; do not discard it merely because the sample is small.
- **Research** — problem evidence is credible enough to justify deeper market/counter-evidence research.
- **Validate** — requires strong problem evidence **and** product-specific evidence. Only these candidates get automatic paid-validation plans.
- **Build** — reserved for opportunities that have passed real-world validation.

Market research must actively search for disconfirming evidence, native/incumbent solutions, saturation, explicit product purchase intent, service-spend evidence, timing, and solo-builder constraints. Many comments in one discussion count as one evidence unit, and self-promotional/vendor evidence cannot substitute for independent buyer demand.

Do not build from score alone; open the underlying evidence and counter-evidence.

## Source strategy

Current automated sources include GitHub, Hacker News, Stack Overflow, Freelancer and Algora. Collection and normalization are intentionally separate: collectors only persist raw evidence, while `radar_process_pending()` performs source-aware scoring so parallel collectors cannot race and assign inconsistent intent.

GitHub collection is demand-focused and filters obvious marketing spam, generated maintenance reports and internal implementation chores. Credible feature/problem reports remain eligible for semantic clustering even when willingness-to-pay is weak; they can survive as Scouts but cannot gain strong Product Confidence without independent product-specific evidence.

Hacker News evidence is role-aware. Genuine Ask HN pain can be `problem_demand`; Show HN and promotional Ask HN posts are `launch_competitor`; generic historical stories are `market_context`. Launches never count as buyer demand or money evidence. HN dollar/budget mentions are ignored unless the text explicitly indicates product purchase intent or service spend.

Algora is intentionally treated as corroborating `service_spend`, not primary problem discovery. The collector runs weekly, verifies every listed bounty against the linked live GitHub issue, deactivates closed issues, uses GitHub activity time for recency, and ignores sub-$50 bounties for semantic matching. Algora evidence may attach to an existing cluster but never creates an Algora-only opportunity.

Platform/API release notes are collected from a curated set of official GitHub repositories. Only stable, high-signal releases involving new capabilities, deprecations, migrations, auth/security, APIs or platform changes are retained. They are `market_context` only: useful for timing and incumbent research, never direct user demand.

Firefox add-on reviews are collected through Mozilla's official Add-ons API. The collector keeps only textual 1–2 star reviews, does not persist reviewer identities, and separates strong feature/workflow gaps from ordinary regressions. Feature/workflow gaps can become `problem_demand`; product failures remain `market_context`.

Freelancer is treated as paid problem-cost evidence, not automatic SaaS demand. The collector uses full project descriptions and classifies requests as `repeatable_workflow`, `custom_build`, or `generic_labor`. Only repeatable workflow spend is eligible for problem discovery; one-off builds and generic staffing/labor remain non-actionable service-spend context.

Changelog and review `market_context` can be semantically attached to an already-established problem cluster at a strict similarity threshold. Context sources never create their own problem clusters, so vendor releases and product regressions cannot manufacture demand.

Reddit requires approved authenticated access in production. `radar-daily` supports official Reddit OAuth when `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` and `REDDIT_USER_AGENT` are configured after Reddit approval. There is no unauthenticated JSON/RSS scraping fallback; until approval, Reddit is recorded as `blocked` rather than silently pretending coverage exists.

Avoid brittle scraping when an API, authenticated source or search layer can provide the same evidence.

## Security note

The service-role key stays server-side. Database RLS is enabled with no public policies. Job routes require `CRON_SECRET` in production.

## Deployed V1 backend

A production Supabase backend is now live with scheduled collection, SQL normalization, weekly ranking, and a token-protected read-only Edge dashboard. See `docs/DEPLOYED_V1.md`.
