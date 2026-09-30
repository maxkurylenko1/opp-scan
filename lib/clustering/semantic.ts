import { config } from "@/lib/config";
import { getAdminClient } from "@/lib/supabase/admin";

const MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;
const ASSIGNMENT = "semantic-v1.2";
const NOISE_MARKER = "noise-filter-v1.1";

const STOPWORDS = new Set([
  "the","and","for","with","from","into","inside","without","through","about","this","that","these","those",
  "add","update","implement","validate","support","official","version","production","issue","model","tool","tools",
  "workflow","workflows","system","systems","client","service","services","data","using","use","new","clear",
  "developer","development","project","partner","needed","expert","engineer","senior","app","website","build",
  "fix","bug","bugs","full-stack","fullstack","looking","work","solution","software","help",
]);

type SignalRow = {
  id: string;
  published_at: string | null;
  persona: string | null;
  industry: string | null;
  category: string | null;
  problem: string;
  workflow: string | null;
  workaround: string | null;
  pain_score: number;
  purchase_intent_score: number;
  evidence_quality_score: number;
  money_signal_type: string | null;
  evidence_role: string | null;
  is_actionable: boolean;
  embedding_model: string | null;
  embedding: string | number[] | null;
  sources?: { key: string; kind: string } | Array<{ key: string; kind: string }> | null;
};

type MatchRow = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  similarity: number;
};

type ReclusterOptions = { pendingOnly?: boolean };

function sourceKind(signal: SignalRow) {
  const source = signal.sources;
  if (Array.isArray(source)) return source[0]?.kind || null;
  return source?.kind || null;
}

function sourceKey(signal: SignalRow) {
  const source = signal.sources;
  if (Array.isArray(source)) return source[0]?.key || null;
  return source?.key || null;
}

function isMarketplace(signal: SignalRow) {
  return sourceKind(signal) === "marketplace";
}

function isContext(signal: SignalRow) {
  return signal.evidence_role === "market_context";
}

function isChangelogContext(signal: SignalRow) {
  return isContext(signal) && sourceKind(signal) === "changelog";
}

function isReviewContext(signal: SignalRow) {
  return isContext(signal) && sourceKind(signal) === "app_review";
}

function isAttachableContext(signal: SignalRow) {
  return isChangelogContext(signal) || isReviewContext(signal);
}

function embeddingText(signal: SignalRow) {
  return [
    signal.problem,
    signal.workflow && `Workflow: ${signal.workflow}`,
    signal.workaround && `Workaround: ${signal.workaround}`,
    signal.persona && `Persona: ${signal.persona}`,
    signal.industry && `Industry: ${signal.industry}`,
    signal.category && `Category: ${signal.category}`,
    signal.money_signal_type && signal.money_signal_type !== "none" && `Money signal: ${signal.money_signal_type}`,
  ].filter(Boolean).join("\n");
}

function vectorLiteral(vector: number[]) {
  return `[${vector.join(",")}]`;
}

// PostgREST typically serializes pgvector as a JSON-shaped string. Reusing
// an existing embedding avoids paying for and recalculating context every day.
function storedEmbedding(signal: SignalRow): number[] | null {
  if (signal.embedding_model !== MODEL || !signal.embedding) return null;
  try {
    const value = typeof signal.embedding === "string" ? JSON.parse(signal.embedding) : signal.embedding;
    return Array.isArray(value) && value.length === DIMENSIONS &&
      value.every((x) => typeof x === "number" && Number.isFinite(x)) ? value : null;
  } catch {
    return null;
  }
}

function tokens(value: string) {
  return new Set(
    value.toLowerCase()
      .replace(/[^a-z0-9а-яё_-]+/gi, " ")
      .split(/\s+/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 3 && !STOPWORDS.has(x)),
  );
}

function hasSharedSubject(a: string, b: string) {
  const aa = tokens(a);
  const bb = tokens(b);
  for (const token of aa) if (bb.has(token)) return true;
  return false;
}

function isNoise(signal: SignalRow) {
  if (isAttachableContext(signal)) return false;
  const p = signal.problem.trim().toLowerCase();
  if (p.includes("digest")) return true;
  if (p.startsWith("arxiv summary")) return true;
  if (/^top\s+\d+\s+.*\b(companies|agencies|tools|apps)\b/.test(p)) return true;
  if (/what\s+.+\s+teach(es)?\s+us\s+about/.test(p)) return true;
  const hasMoneyLabel = Boolean(signal.money_signal_type && signal.money_signal_type !== "none");
  // A keyword-derived money label is not enough to bypass the noise gate.
  // Marketplace posts are direct spend evidence; elsewhere require unusually strong intent/quality.
  if (hasMoneyLabel && (isMarketplace(signal) || signal.purchase_intent_score >= 6 || signal.evidence_quality_score >= 8)) return false;
  if (signal.evidence_quality_score < 6) return true;
  if (signal.pain_score < 5 && signal.purchase_intent_score < 5) return true;
  return false;
}

async function embed(inputs: string[]) {
  if (!config.openAiKey) throw new Error("OPENAI_API_KEY is not configured");
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: inputs, dimensions: DIMENSIONS }),
  });
  if (!response.ok) throw new Error(`OpenAI embeddings failed: ${response.status} ${await response.text()}`);
  const body = await response.json() as { data: Array<{ index: number; embedding: number[] }> };
  return body.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

function chooseMatch(matches: MatchRow[], signal: SignalRow) {
  if (isAttachableContext(signal)) {
    for (const match of matches) {
      const similarity = Number(match.similarity);
      if (similarity >= 0.88) return match;
      if (
        match.category === signal.category &&
        similarity >= 0.80 &&
        hasSharedSubject(match.name, signal.problem)
      ) return match;
    }
    return null;
  }

  if (isMarketplace(signal)) {
    for (const match of matches) {
      const similarity = Number(match.similarity);
      if (similarity >= 0.86) return match;
      if (
        match.category === signal.category &&
        similarity >= 0.78 &&
        hasSharedSubject(match.name, signal.problem)
      ) return match;
    }
    return null;
  }

  for (const match of matches) {
    const similarity = Number(match.similarity);
    if (similarity >= 0.82) return match;
    if (
      match.category === signal.category &&
      similarity >= 0.72 &&
      hasSharedSubject(match.name, signal.problem)
    ) return match;
  }
  return null;
}

export async function reclusterSignals(limit = 100, options: ReclusterOptions = {}) {
  const supabase = getAdminClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const cappedLimit = Math.max(1, Math.min(limit, 500));
  const [{ data: signals, error }, { data: links, error: linksError }] = await Promise.all([
    supabase
      .from("signals")
      .select("id,published_at,persona,industry,category,problem,workflow,workaround,pain_score,purchase_intent_score,evidence_quality_score,money_signal_type,evidence_role,is_actionable,embedding_model,embedding,sources!inner(key,kind)")
      .or("is_actionable.eq.true,evidence_role.eq.market_context")
      .order("is_actionable", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(500),
    supabase.from("cluster_signals").select("signal_id").eq("assignment_method", ASSIGNMENT),
  ]);
  if (error) throw error;
  if (linksError) throw linksError;

  const assigned = new Set((links || []).map((row) => row.signal_id as string));
  let candidates = ((signals || []) as SignalRow[]).filter(
    (signal) => signal.is_actionable || isAttachableContext(signal),
  );
  if (options.pendingOnly) {
    candidates = candidates.filter((signal) => !assigned.has(signal.id) && signal.embedding_model !== NOISE_MARKER);
  }
  candidates = candidates.slice(0, cappedLimit);

  const noiseRows = candidates.filter(isNoise);
  const rows = candidates.filter((signal) => !isNoise(signal));
  const now = new Date().toISOString();

  if (noiseRows.length) {
    const { error: noiseError } = await supabase
      .from("signals")
      .update({ embedding_model: NOISE_MARKER, embedding_updated_at: now })
      .in("id", noiseRows.map((signal) => signal.id));
    if (noiseError) throw noiseError;
  }

  let embedded = 0;
  let reused = 0;
  let created = 0;
  let assignedCount = 0;

  for (let start = 0; start < rows.length; start += 32) {
    const batch = rows.slice(start, start + 32);
    const existing = batch.map(storedEmbedding);
    const missing = batch.map((_, i) => i).filter((i) => !existing[i]);
    const generated = missing.length ? await embed(missing.map((i) => embeddingText(batch[i]))) : [];
    const vectors = [...existing] as Array<number[] | null>;
    missing.forEach((i, n) => { vectors[i] = generated[n]; });

    for (let i = 0; i < batch.length; i++) {
      const signal = batch[i];
      const vector = vectors[i];
      if (!vector) throw new Error(`Missing embedding for signal ${signal.id}`);
      const vectorText = vectorLiteral(vector);
      const updatedAt = new Date().toISOString();

      if (existing[i]) {
        reused++;
      } else {
        const { error: updateSignalError } = await supabase
          .from("signals")
          .update({ embedding: vectorText, embedding_model: MODEL, embedding_updated_at: updatedAt })
          .eq("id", signal.id);
        if (updateSignalError) throw updateSignalError;
        embedded++;
      }

      const { data: matches, error: matchError } = await supabase.rpc("match_problem_clusters", {
        query_embedding: vectorText,
        match_threshold: 0.55,
        match_count: 10,
        version_filter: ASSIGNMENT,
      });
      if (matchError) throw matchError;

      let clusterId: string;
      const match = chooseMatch((matches || []) as MatchRow[], signal);
      if (match) {
        clusterId = match.id;
        await supabase.from("problem_clusters").update({ last_seen_at: signal.published_at || updatedAt, updated_at: updatedAt }).eq("id", clusterId);
      } else {
        // Corroboration/context sources may strengthen an existing cluster, but must never seed one.
        if (sourceKey(signal) === "algora" || isContext(signal)) continue;

        const slug = `semantic-v12-${signal.id}`;
        const { data: cluster, error: clusterError } = await supabase
          .from("problem_clusters")
          .upsert({
            slug,
            name: signal.problem.slice(0, 180),
            summary: signal.problem,
            target_customer: signal.persona || "Unknown",
            category: signal.category || "other",
            status: "watching",
            first_seen_at: signal.published_at || updatedAt,
            last_seen_at: signal.published_at || updatedAt,
            embedding: vectorText,
            clustering_version: ASSIGNMENT,
          }, { onConflict: "slug" })
          .select("id")
          .single();
        if (clusterError) throw clusterError;
        clusterId = cluster.id;
        created++;
      }

      const { error: deleteError } = await supabase
        .from("cluster_signals")
        .delete()
        .eq("signal_id", signal.id)
        .eq("assignment_method", ASSIGNMENT);
      if (deleteError) throw deleteError;

      const { error: linkError } = await supabase.from("cluster_signals").insert({
        cluster_id: clusterId,
        signal_id: signal.id,
        similarity: match ? Number(match.similarity) : 1,
        assignment_method: ASSIGNMENT,
      });
      if (linkError) throw linkError;
      assignedCount++;
    }
  }

  const { error: metricsError } = await supabase.rpc("refresh_semantic_cluster_metrics");
  if (metricsError) throw metricsError;

  return {
    model: MODEL,
    dimensions: DIMENSIONS,
    pendingOnly: Boolean(options.pendingOnly),
    candidates: candidates.length,
    filteredNoise: noiseRows.length,
    processed: rows.length,
    embedded,
    reused,
    assigned: assignedCount,
    clustersCreated: created,
  };
}
