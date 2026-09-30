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

The dashboard distinguishes **Early Research** from ranked Opportunities. Early Research presents a small, manually inspected set of original HN / Firefox problem reports, dated follow-up references and precise research questions. Independently authored reports are explicitly distinguished from related workflows, official technical documentation and competing products; a closed/duplicate historical issue does not establish that a problem remains unresolved. A lead disappears if its original signal is reclassified as non-actionable. Curated research links never create additional signals, clusters or money evidence, never increase product confidence and never fill the US/EU Top-5 artificially. A [dated market-check report](docs/EARLY_RESEARCH_MARKET_CHECK_2026-09-30.md) tests current capabilities, alternative solutions and commercial-validation unknowns for AI-agent handoff, file-scoped Drive access and high-volume Firefox container routing. The three leads have no verified willingness to pay; proposed interviews and paid pilots have not occurred. Reddit collection remains blocked until approved access; public Reddit posts are not imported as corroboration.

**V2.13 Research Inbox:** an admin-only [Research workspace](/research) complements the six manually reviewed Early Research cards. After the daily source normalization and semantic pass, a conservative SQL job at **06:05 UTC** proposes up to 15 additional original reports per day from actionable Hacker News pain, Firefox feature/workflow reviews and qualifying paid Freelancer automation briefs (max 50 unattended New items). It also searches already ingested, embedded, approved-source signals for strict subject-matched reports, service spend, product launches and releases. All matches start as **unverified suggestions**; neither suggestions nor manual confirmation alter the strict US/EU ranking, buyer confidence, market score or money labels. Archived original URLs cannot be automatically re-added; the administrator can manually move items between New / Research / Validate (validation in progress, *not* proven demand) / Archived, record notes and approve or dismiss a proposed match.

The research queue and notes are protected by RLS and service-role-only database access. The Research UI and mutations require the existing admin session and same-origin POSTs; a manual refresh requires the same authorization. Reddit remains excluded from all collection and research suggestions. This first automatic pass uses **the existing collected corpus**, not an unapproved external crawler or an external competitor search. It offers related product-release/launch references only when actual stored content passes strict matching. External competitor comparisons and independent-user interviews still require separate research.

**V2.14 External Research Search:** the protected Research inbox adds targeted, read-only official search across [Hacker News Algolia](https://hn.algolia.com/api) Ask/Show posts and the [GitHub Issues Search API](https://docs.github.com/en/rest/search/search). The dedicated server-side Vercel cron runs daily at **06:40 UTC** (Hobby timing may vary within an hour), after the 06:05 UTC local research-queue refresh. It searches up to **4 eligible leads per day**, at most **3 provider requests per lead** (12/day), 10 results per request, and at most 3 matched candidates per search surface. Existing `GITHUB_TOKEN` is used if configured; otherwise the job uses GitHub's lower unauthenticated limits, stops on rate limiting, and never retries aggressively. A query can be edited privately per lead; only the targeted query, not private notes, is sent to the public search APIs.

Results are stored only in private `research_external_refs`, excluding original links, curated manual reference URLs and items already present in `raw_items`. HN Ask posts are possible independent problem reports; HN Show posts are possible competing solutions; GitHub issues are potentially related requests or internal project tasks, never assumed independent buyers. All start **suggested**. An admin can open each original link, add a reason, and confirm relevance or dismiss it. Confirming a link never imports its contents into `raw_items`, `signals`, embeddings, clusters, revenue evidence, buyer confidence or the US/EU Top-5. The job does not scrape sites, contact authors, use Google Drive credentials, or call Reddit. A search's timestamp, provider status and counts are audit-logged, and errors do not justify bypassing the API's rate limits.

Reddit requires approved authenticated access in production. `radar-daily` supports official Reddit OAuth when `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` and `REDDIT_USER_AGENT` are configured after Reddit approval. There is no unauthenticated JSON/RSS scraping fallback; until approval, Reddit is recorded as `blocked` rather than silently pretending coverage exists.

Avoid brittle scraping when an API, authenticated source or search layer can provide the same evidence.

## Security note

The service-role key stays server-side. Database RLS is enabled with no public policies. Job routes require `CRON_SECRET` in production.

## Deployed V1 backend

A production Supabase backend is now live with scheduled collection, SQL normalization, weekly ranking, and a token-protected read-only Edge dashboard. See `docs/DEPLOYED_V1.md`.
