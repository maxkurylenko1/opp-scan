# Reddit Data API access plan

Status: approval required before API access.

## Current production behavior

Opp Scan does **not** use Reddit public JSON, old.reddit or RSS as a fallback.
If approved OAuth credentials are absent, the collector records:

- collector: `reddit`
- status: `blocked`
- reason: `reddit_approval_required`

This deliberately distinguishes an external policy/access dependency from a technical collector failure.

## Requested use case

Opp Scan is a single-developer internal Opportunity Radar. It combines independent public evidence from multiple sources to detect recurring software/workflow problems and decide which product hypotheses deserve manual validation.

Reddit would be one supporting source, not the sole source.

### Scope

Read-only public post listings from a small allowlist:

- r/SaaS
- r/Entrepreneur
- r/smallbusiness
- r/n8n
- r/automation
- r/webdev

Current schedule: once per day.

Current planned request volume after approval:

- 1 OAuth token request per collector run
- 1 listing request per approved subreddit
- up to 25 newest posts returned per subreddit
- no comment crawling in V1

### Data used

Needed fields:

- Reddit post identifier/permalink
- subreddit
- title
- selftext
- created timestamp
- score
- comment count
- upvote ratio

No voting, posting, commenting, messaging, moderation or account automation.

User identity is not a product feature. Author identity is needed only to avoid overcounting repeated evidence from one account and should be pseudonymized before persistence.

### Use of automated analysis

The tool classifies public posts for evidence such as recurring pain, manual workarounds and explicit purchase intent. It does not train or fine-tune any machine-learning model on Reddit data. Any model-assisted classification/embedding should be disclosed to Reddit in the access request and used only if permitted by the approval.

### Distribution

Reddit content is not resold or exposed as a standalone dataset. The output is an internal opportunity dashboard containing derived evidence, counts, confidence scores and links back to source discussions.

## Why Devvit is not sufficient

The required workflow runs in an external Supabase/Next.js research pipeline and combines Reddit with GitHub, Hacker News, Stack Overflow, freelance demand, changelogs and other sources. It needs low-volume, read-only access to a small set of public subreddit listings without installing an app into each subreddit or performing actions on Reddit.

## Approval request form

Current official developer request:
https://support.reddithelp.com/hc/en-us/requests/new?tf_42139884615700=api_request_type_developer_clone&ticket_form_id=14868593862164

Reddit's Responsible Builder Policy states that API access requires explicit approval. Commercial use requires explicit written approval.

## Suggested application answers

**Role:** Developer / individual.

**Company name:** n/a.

**Purpose of product/service:**
Single-developer internal Opportunity Radar that identifies recurring software and workflow problems from multiple independent public sources. Reddit would be a low-volume read-only supporting source. The tool helps decide which product hypotheses deserve manual customer validation; it does not automate outreach to Reddit users.

**What will be delivered to users/customers with Reddit data?**
No Reddit dataset or raw content will be delivered to customers. The system is currently single-user/internal and produces derived problem clusters, evidence counts, confidence scores and links to original public discussions.

**Distribution / expected audience:**
Internal use by one developer. No public redistribution of Reddit data.

**What will the app do on Reddit?**
Read the newest public posts from a small approved subreddit allowlist once per day. No posting, commenting, voting, messaging, moderation actions or account automation.

**Why not Devvit?**
The tool is an external multi-source research pipeline running on Supabase/Next.js. It needs read-only access to public subreddit listings and combines those signals with non-Reddit sources; it does not need or perform in-Reddit UI/actions.

**Subreddits:**
SaaS, Entrepreneur, smallbusiness, n8n, automation, webdev.

**Data budget:**
Approximately 7 Reddit API requests per day (one OAuth token request plus one listing request for each of six subreddits), retrieving at most 25 recent post objects per subreddit. No comment crawl in V1.

**Source code:**
https://github.com/maxkurylenko1/opp-scan

**Data/AI statement:**
No Reddit data resale, no advertising targeting, no user profiling, no sensitive-trait inference, and no model training/fine-tuning on Reddit data. Public post content is used only for low-volume classification of recurring software/workflow pain and source-linked evidence, subject to Reddit's approval terms.

## After approval

1. Obtain approved OAuth client ID/secret.
2. Configure `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and a transparent `REDDIT_USER_AGENT`.
3. Run a single production collector test.
4. Verify OAuth status, rate-limit headers and data fields.
5. Check 20-30 collected posts manually for relevance/precision before enabling Reddit evidence in weekly ranking.
