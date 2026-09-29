import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const jsonHeaders = { "Content-Type": "application/json" };

type SourceKey = "hackernews" | "github" | "reddit";
type SourceKind = "hackernews" | "github" | "reddit";
type Raw = {
  sourceKey: SourceKey;
  sourceKind: SourceKind;
  externalId: string;
  sourceUrl: string;
  author: string | null;
  title: string;
  body: string;
  publishedAt: string;
  rawPayload: Record<string, unknown>;
};

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sourceMeta(key: SourceKey) {
  if (key === "hackernews") return { name: "Hacker News", kind: "hackernews", base_url: "https://news.ycombinator.com" };
  if (key === "reddit") return { name: "Reddit", kind: "reddit", base_url: "https://www.reddit.com" };
  return { name: "GitHub", kind: "github", base_url: "https://github.com" };
}

async function ensureSource(key: SourceKey) {
  const meta = sourceMeta(key);
  const { data, error } = await supabase.from("sources").upsert({ key, ...meta, enabled: true }, { onConflict: "key" }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

function decodeHtml(value: string | null | undefined) {
  return (value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function tagValue(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] || "";
}

function hnAskLooksPromotional(text: string) {
  return /(\bi built\b|\bi made\b|\bi(?:'m| am) building\b|\bwe built\b|\bwe launched\b|\bwe(?:'re| are) building\b|\bmy (?:app|tool|extension|saas)\b|looking for feedback on (?:the|my|our) beta|rolling out|available (?:on|in) (?:the )?(?:chrome web store|app store|play store)|chrome web store|try it|check it out|search ["“'][^"”']+["”'] in|source:\s*https?:\/\/|demo:\s*https?:\/\/)/i.test(text);
}

function hnQuestionDemand(text: string) {
  return explicitProblemIntent(text)
    || directProductIntent(text)
    || /(ask hn|what do you use|what are you using|which (?:tool|service|app)|recommend(?:ation|ations)?|is there (?:a|an)|does anyone know|how do you (?:handle|manage|solve|automate)|any good (?:tool|service|alternative)|looking for|alternative to|struggling with|pain point)/i.test(text);
}

function hnLaunchRelevant(text: string) {
  return /(tool|software|saas|api|sdk|automation|workflow|developer|devtool|browser|extension|ai|agent|llm|creator|video|crm|ecommerce|game|security|monitoring|observability|database|data|search|deploy|hosting|billing|invoice|marketing|analytics|productivity)/i.test(text);
}

async function fetchHNByTag(tag: "ask_hn" | "show_hn", since: number, hitsPerPage: number) {
  const url = `https://hn.algolia.com/api/v1/search_by_date?tags=${tag}&hitsPerPage=${hitsPerPage}&numericFilters=created_at_i>${since}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HN ${tag} ${res.status}`);
  const json = await res.json();
  return json.hits || [];
}

async function collectHN(): Promise<Raw[]> {
  const since = Math.floor((Date.now() - 7 * 86400_000) / 1000);
  const [askHits, showHits] = await Promise.all([
    fetchHNByTag("ask_hn", since, 80),
    fetchHNByTag("show_hn", since, 80),
  ]);

  const rows: Raw[] = [];

  for (const h of askHits) {
    const title = h.title || "Untitled";
    const body = decodeHtml(h.story_text);
    const text = `${title}\n${body}`;
    if (!hnQuestionDemand(text)) continue;
    const promotional = hnAskLooksPromotional(text);

    rows.push({
      sourceKey: "hackernews",
      sourceKind: "hackernews",
      externalId: String(h.objectID),
      sourceUrl: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      author: h.author || null,
      title,
      body,
      publishedAt: h.created_at,
      rawPayload: {
        ...h,
        collector: "hn-v1.4.1",
        evidence_role: promotional ? "launch_competitor" : "problem_demand",
        classification_hints: {
          ask_hn: true,
          show_hn: false,
          ask_hn_self_promo: promotional,
          explicit_problem: explicitProblemIntent(text),
          direct_product_intent: promotional ? false : directProductIntent(text),
        },
      },
    });
  }

  for (const h of showHits) {
    const title = h.title || "Untitled";
    const body = decodeHtml(h.story_text);
    const text = `${title}\n${body}`;
    if (!hnLaunchRelevant(text)) continue;

    rows.push({
      sourceKey: "hackernews",
      sourceKind: "hackernews",
      externalId: String(h.objectID),
      sourceUrl: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      author: h.author || null,
      title,
      body,
      publishedAt: h.created_at,
      rawPayload: {
        ...h,
        collector: "hn-v1.4",
        evidence_role: "launch_competitor",
        classification_hints: {
          ask_hn: false,
          show_hn: true,
          founder_claimed_problem: explicitProblemIntent(text),
          direct_product_intent: false,
        },
      },
    });
  }

  return [...new Map(rows.map((x) => [x.externalId, x])).values()]
    .sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 80);
}


function selfPromoText(text: string) {
  return /(^|\b)(show hn|launch hn|i built|i made|we built|we made|we launched|launching my|my saas|my app|introducing our)\b/i.test(text);
}

function directProductIntent(text: string) {
  return /(would pay|willing to pay|pay for (?:a|an|this|something)|looking for (?:a|an|some) (?:tool|app|service|alternative)|need (?:a|an) (?:tool|app|service)|any (?:tool|app|service).{0,50}(?:for|that)|paid (?:tool|app|service)|subscription.{0,40}(?:need|worth|looking))/i.test(text);
}

function serviceSpendIntent(text: string) {
  return /(hiring|hire (?:a|an|someone|developer|freelancer|contractor)|looking for (?:a|an) (?:developer|freelancer|contractor)|freelancer needed|contractor needed|bounty|cash reward|paid bounty)/i.test(text);
}

function explicitProblemIntent(text: string) {
  return /(feature request|is your feature request related to a problem|what problem are you hitting|current(?:ly)? .{0,60}(?:cannot|can't|doesn't|does not|fails|missing)|there is no way|no way to|wish (?:there|i|we)|need (?:a way|to|an? tool)|looking for (?:an? )?(?:tool|alternative|way)|manual(?:ly)?|tedious|time-consuming|frustrat|pain point|struggle|blocked|keeps? (?:failing|breaking))/i.test(text);
}

function githubNoise(title: string, body: string) {
  const t = `${title}\n${body}`;
  const titleNoise = /^(?:fix|feat|chore|docs|test|tests|refactor|ci|build|release|perf|spec|research|prd|deep-review|fork watch|daily|weekly|phase\s*\d*|history|master index|team-status|curriculum-eval)(?:\(|:|\s|—|-|\[)/i;
  const spam = /(best .{0,40}(?:agency|company)|digital marketing agency|industrial training|build your career|career with|internship program|seo services|web development company|youtube links|ссылки youtube|sample feature request for testing|test feature issue for automation|invoice ocr api:\s*automate)/i;
  const generatedMeta = /(daily repository status report|master index \(|fork watch:|deep manual audit|this issue does not authorize|definition of done for this issue|current checkpoint:|implementation repository:|\npart of #\d+)/i;
  return titleNoise.test(title.trim()) || spam.test(t) || generatedMeta.test(t);
}

function githubDemandSignal(item: any) {
  const title = item.title || "";
  const body = decodeHtml(item.body);
  if (githubNoise(title, body)) return false;
  const text = `${title}\n${body}`;
  const labels = (item.labels || []).map((x: any) => typeof x === "string" ? x : x?.name || "").join(" ");
  const featureLabel = /(feature|enhancement|request|improvement|ux)/i.test(labels);
  const explicit = explicitProblemIntent(text) || directProductIntent(text);
  const reactions = Number(item.reactions?.total_count || 0);
  const social = Number(item.comments || 0) >= 2 || reactions >= 3;
  return explicit && (featureLabel || social || /feature request|would pay|looking for (?:a|an|some) (?:tool|app|service|alternative)/i.test(text));
}

async function collectGitHub(): Promise<Raw[]> {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const queries = [
    `is:issue created:>=${since} "feature request" automation`,
    `is:issue created:>=${since} "feature request" workflow`,
    `is:issue created:>=${since} "is your feature request related to a problem"`,
    `is:issue created:>=${since} "what problem are you hitting"`,
    `is:issue created:>=${since} "looking for" "tool"`,
    `is:issue created:>=${since} "would pay"`,
  ];
  const all: Raw[] = [];
  for (const q of queries) {
    const res = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=25`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "opportunity-radar-v1.3" },
    });
    if (!res.ok) {
      if (res.status === 403 || res.status === 422) continue;
      throw new Error(`GitHub ${res.status}`);
    }
    const json = await res.json();
    for (const item of json.items || []) {
      const title = item.title || "Untitled issue";
      const body = decodeHtml(item.body);
      if (githubNoise(title, body)) continue;
      if (!githubDemandSignal(item)) continue;
      all.push({
        sourceKey: "github",
        sourceKind: "github",
        externalId: String(item.id),
        sourceUrl: item.html_url,
        author: item.user?.login || null,
        title,
        body,
        publishedAt: item.created_at,
        rawPayload: {
          ...item,
          collector: "github-demand-v1.3",
          classification_hints: {
            explicit_problem: explicitProblemIntent(`${title}\n${body}`),
            direct_product_intent: directProductIntent(`${title}\n${body}`),
            service_spend_intent: serviceSpendIntent(`${title}\n${body}`),
          },
        },
      });
    }
  }
  return [...new Map(all.map((x) => [x.externalId, x])).values()].slice(0, 60);
}

class RedditAccessBlocked extends Error {
  code = "reddit_access_blocked";
}

function redditSubreddits() {
  const configured = (Deno.env.get("REDDIT_SUBREDDITS") || "SaaS,Entrepreneur,smallbusiness,n8n,automation,webdev")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return [...new Set(configured)].slice(0, 12);
}

async function collectReddit(): Promise<Raw[]> {
  const clientId = Deno.env.get("REDDIT_CLIENT_ID");
  const clientSecret = Deno.env.get("REDDIT_CLIENT_SECRET");
  const userAgent = Deno.env.get("REDDIT_USER_AGENT");

  // Reddit's 2026 Responsible Builder Policy requires explicit approval before Data API access.
  // Never fall back to unauthenticated .json/RSS scraping when approval credentials are absent.
  if (!clientId || !clientSecret || !userAgent) {
    throw new RedditAccessBlocked(
      "Reddit Data API approval/credentials required: configure REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET and REDDIT_USER_AGENT after Reddit approval.",
    );
  }

  const auth = btoa(`${clientId}:${clientSecret}`);
  const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent,
    },
    body: "grant_type=client_credentials",
  });

  if (!tokenRes.ok) {
    const body = (await tokenRes.text()).slice(0, 400);
    throw new Error(`Reddit OAuth token failed: ${tokenRes.status} ${body}`);
  }

  const tokenJson = await tokenRes.json();
  const token = tokenJson?.access_token as string | undefined;
  if (!token) throw new Error("Reddit OAuth token response did not include access_token");

  const rows: Raw[] = [];
  const subreddits = redditSubreddits();

  for (const subreddit of subreddits) {
    const url = `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/new?limit=25&raw_json=1`;
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": userAgent,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new Error(`Reddit OAuth listing failed for r/${subreddit}: ${res.status} ${body}`);
    }

    const json = await res.json();
    for (const child of json?.data?.children || []) {
      const post = child?.data || {};
      const title = post.title || "";
      const body = post.selftext || "";
      const text = `${title}\n${body}`;

      if (!explicitProblemIntent(text) && !directProductIntent(text)) continue;
      if (selfPromoText(text)) continue;

      const pseudonymousAuthor = post.author
        ? `reddit:${(await sha256(String(post.author))).slice(0, 16)}`
        : null;

      rows.push({
        sourceKey: "reddit",
        sourceKind: "reddit",
        externalId: String(post.name || post.id || post.permalink),
        sourceUrl: post.permalink ? `https://www.reddit.com${post.permalink}` : url,
        author: pseudonymousAuthor,
        title,
        body: body.slice(0, 4000),
        publishedAt: post.created_utc
          ? new Date(post.created_utc * 1000).toISOString()
          : new Date().toISOString(),
        rawPayload: {
          subreddit,
          strategy: "approved-oauth",
          collector: "reddit-v1.4",
          score: post.score,
          num_comments: post.num_comments,
          upvote_ratio: post.upvote_ratio,
        },
      });
    }
  }

  return [...new Map(rows.map((x) => [x.externalId, x])).values()]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 60);
}


function scoreText(text: string, sourceKey: string) {
  const lower = text.toLowerCase();
  const painTerms = ["hate","pain","broken","frustrating","tedious","manual","manually","hours","annoying","slow","difficult","problem","struggle","blocked","missing","cannot","can't"];
  const urgencyTerms = ["urgent","asap","today","this week","blocked","blocking","critical","need now"];
  const painHits = painTerms.filter((t) => lower.includes(t)).length;
  const urgencyHits = urgencyTerms.filter((t) => lower.includes(t)).length;
  const productIntent = directProductIntent(text);
  const serviceIntent = serviceSpendIntent(text);
  const weakMoney = /(pricing|subscription|paid plan|expensive)/i.test(text);
  const purchase = productIntent ? 8 : serviceIntent ? 6 : weakMoney ? 2 : 1;
  const sourceBoost = sourceKey === "reddit" && explicitProblemIntent(text) ? 1 : 0;
  return {
    pain: Math.min(10, 3 + painHits * 1.1 + sourceBoost),
    purchase,
    urgency: Math.min(10, 2 + urgencyHits * 2),
    evidence: Math.min(10, 4 + Math.min(3, painHits) + (productIntent ? 2 : 0) + (serviceIntent ? 1 : 0)),
  };
}

function categoryFor(text: string) {
  const t = text.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ["browser-extension", /(chrome|browser|extension|firefox)/],
    ["developer-tool", /(api|sdk|typescript|javascript|react|next\.js|developer|github|ci\/cd|devops|debug|kubernetes)/],
    ["ai-tooling", /(ai|llm|gpt|agent|model|prompt|mcp)/],
    ["creator-tooling", /(video|youtube|tiktok|creator|subtitle|podcast|shorts)/],
    ["ecommerce", /(shopify|woocommerce|ecommerce|store|merchant)/],
    ["gaming", /(game|gaming|unity|pixi|casino|slot)/],
    ["automation", /(automation|workflow|manual|manually|zapier|make\.com|n8n)/],
  ];
  return rules.find(([, r]) => r.test(t))?.[0] || "general-software";
}

function clusterParts(text: string) {
  const stop = new Set(["the","and","for","with","that","this","from","have","need","looking","feature","request","tool","using","when","into","your","you","our","how","why","what","can","could","would","issue","problem","support","please","new","add","make","manual","manually"]);
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !stop.has(w));
  return [...new Set(words)].slice(0, 4).length ? [...new Set(words)].slice(0, 4) : ["general", "workflow"];
}

function inferMoney(text: string, sourceKey: string) {
  if (/bounty|cash reward|paid bounty/i.test(text)) return { type: "bounty", amount: null, currency: null };
  if (serviceSpendIntent(text)) return { type: "job_post", amount: null, currency: null };
  if (directProductIntent(text)) return { type: "purchase_request", amount: null, currency: null };
  const moneyContext = /(budget|pay|paid|bounty|reward|hire|contract)/i.test(text);
  const m = moneyContext ? text.match(/(?:\$|€|£)\s?(\d{2,6}(?:[.,]\d{1,2})?)/) : null;
  if (m) return { type: "budget", amount: Number(m[1].replace(",", ".")), currency: text.includes("€") ? "EUR" : text.includes("£") ? "GBP" : "USD" };
  return { type: "none", amount: null, currency: null };
}

async function persist(items: Raw[]) {
  let inserted = 0;
  for (const item of items) {
    const sourceId = await ensureSource(item.sourceKey);
    const contentHash = await sha256(`${item.title}|${item.body}|${item.sourceUrl}`);
    const { data, error } = await supabase.from("raw_items").upsert({
      source_id: sourceId,
      external_id: item.externalId,
      source_url: item.sourceUrl,
      author: item.author,
      title: item.title,
      body: item.body,
      published_at: item.publishedAt,
      raw_payload: item.rawPayload,
      content_hash: contentHash,
    }, { onConflict: "source_id,external_id", ignoreDuplicates: true }).select("id").maybeSingle();
    if (error) throw error;
    if (data?.id) inserted++;
  }
  return inserted;
}

async function processRaw(limit = 200) {
  const { data: rows, error } = await supabase.from("raw_items").select("*, sources!inner(key,kind)").is("processed_at", null).order("published_at", { ascending: false }).limit(limit);
  if (error) throw error;
  let processed = 0;
  for (const row of rows || []) {
    const combined = `${row.title}\n${row.body || ""}`.slice(0, 12000);
    const sourceKey = row.sources.key as string;
    const scores = scoreText(combined, sourceKey);
    const category = categoryFor(combined);
    const parts = clusterParts(row.title);
    const slug = `${category}-${parts.join("-")}`.replace(/-+/g, "-").slice(0, 110);
    const clusterName = parts.map((x) => x[0].toUpperCase() + x.slice(1)).join(" ");
    const money = inferMoney(combined, sourceKey);
    const relevance = Math.min(10, Math.round((scores.pain * 0.45) + (scores.purchase * 0.35) + (scores.evidence * 0.2)));
    const promotional = selfPromoText(combined);
    const noisyGithub = sourceKey === "github" && githubNoise(row.title || "", row.body || "");
    const explicitProblem = explicitProblemIntent(combined);
    const githubDemand = sourceKey === "github" ? githubDemandSignal({ ...(row.raw_payload || {}), title: row.title, body: row.body }) : false;

    let actionable = false;
    if (sourceKey === "github") {
      // For GitHub, "actionable" means eligible for semantic clustering, not proven business value.
      // Strongly formulated feature requests with decent evidence stay alive as Scouts even without WTP.
      actionable = !noisyGithub && githubDemand && (scores.evidence >= 6 || relevance >= 5 || money.type !== "none");
    } else if (sourceKey === "reddit") {
      actionable = !promotional && explicitProblem && relevance >= 5;
    } else if (sourceKey === "hackernews") {
      actionable = !promotional && explicitProblem && relevance >= 5;
    } else {
      actionable = relevance >= 6 && (explicitProblem || money.type !== "none");
    }

    const persona = sourceKey === "github" ? "software team / developer" : sourceKey === "reddit" ? "founder / operator / developer" : "tech/startup operator";

    const { data: signal, error: signalError } = await supabase.from("signals").upsert({
      raw_item_id: row.id,
      source_id: row.source_id,
      published_at: row.published_at,
      persona,
      industry: category,
      category,
      problem: row.title,
      workflow: null,
      workaround: /manual|manually/i.test(combined) ? "Manual workflow mentioned in source" : null,
      evidence_excerpt: combined.slice(0, 700),
      pain_score: Math.round(scores.pain),
      urgency_score: Math.round(scores.urgency),
      purchase_intent_score: Math.round(scores.purchase),
      money_signal_type: money.type,
      money_amount: money.amount,
      money_currency: money.currency,
      evidence_quality_score: Math.round(scores.evidence),
      relevance_score: relevance,
      is_actionable: actionable,
      extraction_version: "cross-source-heuristic-v1.3",
    }, { onConflict: "raw_item_id" }).select("id").single();
    if (signalError) throw signalError;

    const { data: cluster, error: clusterError } = await supabase.from("problem_clusters").upsert({
      slug,
      name: `${clusterName} (${category})`,
      summary: row.title,
      target_customer: persona,
      category,
      last_seen_at: row.published_at,
    }, { onConflict: "slug" }).select("id").single();
    if (clusterError) throw clusterError;

    const { error: linkError } = await supabase.from("cluster_signals").upsert({ cluster_id: cluster.id, signal_id: signal.id, assignment_method: "heuristic-v1" }, { onConflict: "cluster_id,signal_id" });
    if (linkError) throw linkError;
    await supabase.from("raw_items").update({ processed_at: new Date().toISOString() }).eq("id", row.id);
    processed++;
  }
  return processed;
}

async function runCollector(name: SourceKey) {
  const sourceId = await ensureSource(name);
  const { data: run, error } = await supabase.from("collection_runs").insert({ source_id: sourceId, collector: name, status: "running" }).select("id").single();
  if (error) throw error;
  try {
    const items = name === "hackernews" ? await collectHN() : name === "reddit" ? await collectReddit() : await collectGitHub();
    const inserted = await persist(items);
    await supabase.from("collection_runs").update({ status: "success", finished_at: new Date().toISOString(), records_seen: items.length, records_inserted: inserted }).eq("id", run.id);
    await supabase.from("sources").update({ last_success_at: new Date().toISOString() }).eq("id", sourceId);
    return { collector: name, seen: items.length, inserted };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof RedditAccessBlocked) {
      await supabase.from("collection_runs").update({
        status: "blocked",
        finished_at: new Date().toISOString(),
        error_text: message,
        metadata: {
          reason: "reddit_approval_required",
          policy: "Responsible Builder Policy",
          collector_version: "reddit-v1.4",
        },
      }).eq("id", run.id);
      return { collector: name, seen: 0, inserted: 0, blocked: true, error: message };
    }

    await supabase.from("collection_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_text: message }).eq("id", run.id);
    return { collector: name, seen: 0, inserted: 0, error: message };
  }
}

Deno.serve(async () => {
  try {
    const collectors = [];
    for (const name of ["hackernews", "github", "reddit"] as SourceKey[]) collectors.push(await runCollector(name));
    // Collection only. Normalization/scoring is intentionally centralized in radar_process_pending()
    // to avoid races with parallel collectors and source-specific scoring drift.
    return new Response(JSON.stringify({ ok: true, collectors, processed: 0, at: new Date().toISOString() }), { headers: jsonHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: jsonHeaders });
  }
});
