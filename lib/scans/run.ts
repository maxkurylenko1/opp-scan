import { reclusterSignals } from "@/lib/clustering/semantic";
import { getAdminClient } from "@/lib/supabase/admin";
import { researchThemes } from "@/lib/research/theme-market";
import { generateValidationPlans } from "@/lib/validation/generate-plan";
import { generateOpportunityBriefs } from "@/lib/opportunities/build-brief";

async function counts(supabase: any) {
  const [{ count: raw }, { count: signals }, { count: actionable }] = await Promise.all([
    supabase.from("raw_items").select("id", { count: "exact", head: true }),
    supabase.from("signals").select("id", { count: "exact", head: true }),
    supabase.from("signals").select("id", { count: "exact", head: true }).eq("is_actionable", true),
  ]);
  return { raw: raw || 0, signals: signals || 0, actionable: actionable || 0 };
}

function safe(value: any) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return String(value); }
}

export async function runManualScan() {
  const supabase = getAdminClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const before = await counts(supabase);
  const startedAt = new Date().toISOString();
  const { data: scan, error: scanError } = await supabase.from("radar_scans").insert({
    trigger_type: "manual",
    status: "running",
    scan_date: startedAt.slice(0, 10),
    started_at: startedAt,
    metadata: { requested_from: "admin" },
  }).select("id").single();
  if (scanError) throw scanError;

  const scanId = scan.id as string;
  const metadata: Record<string, any> = {};
  try {
    const collectors = ["radar-daily", "radar-stackoverflow", "radar-freelancer", "radar-algora"];
    const collectorResults = await Promise.all(collectors.map(async (name) => {
      const started = Date.now();
      const { data, error } = await supabase.functions.invoke(name, { body: { trigger: "manual", scanId } });
      return {
        name,
        ok: !error && data?.ok !== false,
        durationMs: Date.now() - started,
        data: safe(data),
        error: error ? String(error.message || error) : data?.ok === false ? String(data?.error || "collector failed") : null,
      };
    }));
    metadata.collectors = collectorResults;

    const now = new Date().toISOString();
    const { data: newRuns, error: runsError } = await supabase
      .from("collection_runs")
      .select("id,collector,status,records_seen,records_inserted,error_text,started_at,finished_at")
      .is("scan_id", null)
      .gte("started_at", startedAt)
      .lte("started_at", now);
    if (runsError) throw runsError;
    if (newRuns?.length) {
      const { error: linkError } = await supabase.from("collection_runs").update({ scan_id: scanId }).in("id", newRuns.map((r: any) => r.id));
      if (linkError) throw linkError;
    }

    const { data: processed, error: processError } = await supabase.rpc("radar_process_pending", { p_limit: 300 });
    if (processError) throw processError;
    metadata.processedPending = processed;

    const semantic = await reclusterSignals(150, { pendingOnly: true });
    metadata.semantic = safe(semantic);

    const { data: ranking, error: rankError } = await supabase.rpc("radar_refresh_and_rank");
    if (rankError) throw rankError;
    metadata.ranking = safe(ranking);

    const research = await researchThemes(3, false);
    metadata.marketResearch = safe(research);

    const validations = await generateValidationPlans(3, false);
    metadata.validations = safe(validations);

    const briefs = await generateOpportunityBriefs(10, false);
    metadata.briefs = safe(briefs);

    const { data: snapshotCount, error: snapshotError } = await supabase.rpc("radar_snapshot_scan", { p_scan_id: scanId, p_limit: 5 });
    if (snapshotError) throw snapshotError;
    metadata.snapshotCount = snapshotCount;

    const after = await counts(supabase);
    const { data: linkedRuns, error: linkedError } = await supabase
      .from("collection_runs")
      .select("status,records_inserted,error_text")
      .eq("scan_id", scanId);
    if (linkedError) throw linkedError;

    const runFailures = (linkedRuns || []).filter((r: any) => r.status === "failed").length;
    const invokeFailures = collectorResults.filter((r) => !r.ok).length;
    const sourceFailures = Math.max(runFailures, invokeFailures);
    const errors = [
      ...(linkedRuns || []).filter((r: any) => r.error_text).map((r: any) => r.error_text),
      ...collectorResults.filter((r) => r.error).map((r) => `${r.name}: ${r.error}`),
    ];

    const { error: finishError } = await supabase.from("radar_scans").update({
      status: sourceFailures > 0 ? "partial" : "success",
      finished_at: new Date().toISOString(),
      new_raw_items: Math.max(0, after.raw - before.raw),
      new_signals: Math.max(0, after.signals - before.signals),
      new_actionable: Math.max(0, after.actionable - before.actionable),
      source_runs: (linkedRuns || []).length,
      source_failures: sourceFailures,
      error_text: errors.length ? errors.join("\n").slice(0, 5000) : null,
      metadata,
    }).eq("id", scanId);
    if (finishError) throw finishError;

    return { id: scanId, status: sourceFailures > 0 ? "partial" : "success" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("radar_scans").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_text: message.slice(0, 5000),
      metadata,
    }).eq("id", scanId);
    return { id: scanId, status: "failed", error: message };
  }
}
