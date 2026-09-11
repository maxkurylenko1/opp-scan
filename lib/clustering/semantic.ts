import { config } from "@/lib/config";
import { getAdminClient } from "@/lib/supabase/admin";

const MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;
const ASSIGNMENT = "semantic-v1.1";

type SignalRow = {
  id: string;
  published_at: string | null;
  persona: string | null;
  industry: string | null;
  category: string | null;
  problem: string;
  workflow: string | null;
  workaround: string | null;
};

type MatchRow = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  similarity: number;
};

function embeddingText(signal: SignalRow) {
  return [
    signal.problem,
    signal.workflow && `Workflow: ${signal.workflow}`,
    signal.workaround && `Workaround: ${signal.workaround}`,
    signal.persona && `Persona: ${signal.persona}`,
    signal.industry && `Industry: ${signal.industry}`,
    signal.category && `Category: ${signal.category}`,
  ].filter(Boolean).join("\n");
}

function vectorLiteral(vector: number[]) {
  return `[${vector.join(",")}]`;
}

async function embed(inputs: string[]) {
  if (!config.openAiKey) throw new Error("OPENAI_API_KEY is not configured");
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: inputs, dimensions: DIMENSIONS }),
  });
  if (!response.ok) throw new Error(`OpenAI embeddings failed: ${response.status} ${await response.text()}`);
  const body = await response.json() as { data: Array<{ index: number; embedding: number[] }> };
  return body.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

function chooseMatch(matches: MatchRow[], category: string | null) {
  const sameCategory = matches.find((m) => m.category === category && Number(m.similarity) >= 0.72);
  if (sameCategory) return sameCategory;
  return matches.find((m) => Number(m.similarity) >= 0.80) || null;
}

export async function reclusterSignals(limit = 100) {
  const supabase = getAdminClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data: signals, error } = await supabase
    .from("signals")
    .select("id,published_at,persona,industry,category,problem,workflow,workaround")
    .eq("is_actionable", true)
    .order("published_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 500)));
  if (error) throw error;

  const rows = (signals || []) as SignalRow[];
  let embedded = 0;
  let created = 0;
  let assigned = 0;

  for (let start = 0; start < rows.length; start += 32) {
    const batch = rows.slice(start, start + 32);
    const vectors = await embed(batch.map(embeddingText));

    for (let i = 0; i < batch.length; i++) {
      const signal = batch[i];
      const vector = vectors[i];
      const vectorText = vectorLiteral(vector);
      const now = new Date().toISOString();

      const { error: updateSignalError } = await supabase
        .from("signals")
        .update({ embedding: vectorText, embedding_model: MODEL, embedding_updated_at: now })
        .eq("id", signal.id);
      if (updateSignalError) throw updateSignalError;
      embedded++;

      const { data: matches, error: matchError } = await supabase.rpc("match_problem_clusters", {
        query_embedding: vectorText,
        match_threshold: 0.70,
        match_count: 8,
        version_filter: ASSIGNMENT,
      });
      if (matchError) throw matchError;

      let clusterId: string;
      const match = chooseMatch((matches || []) as MatchRow[], signal.category);
      if (match) {
        clusterId = match.id;
        await supabase.from("problem_clusters").update({ last_seen_at: signal.published_at || now, updated_at: now }).eq("id", clusterId);
      } else {
        const slug = `semantic-${signal.id}`;
        const { data: cluster, error: clusterError } = await supabase
          .from("problem_clusters")
          .insert({
            slug,
            name: signal.problem.slice(0, 180),
            summary: signal.problem,
            target_customer: signal.persona || "Unknown",
            category: signal.category || "other",
            status: "watching",
            first_seen_at: signal.published_at || now,
            last_seen_at: signal.published_at || now,
            embedding: vectorText,
            clustering_version: ASSIGNMENT,
          })
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

      const similarity = match ? Number(match.similarity) : 1;
      const { error: linkError } = await supabase.from("cluster_signals").insert({
        cluster_id: clusterId,
        signal_id: signal.id,
        similarity,
        assignment_method: ASSIGNMENT,
      });
      if (linkError) throw linkError;
      assigned++;
    }
  }

  const { error: metricsError } = await supabase.rpc("refresh_semantic_cluster_metrics");
  if (metricsError) throw metricsError;

  return { model: MODEL, dimensions: DIMENSIONS, processed: rows.length, embedded, assigned, clustersCreated: created };
}
