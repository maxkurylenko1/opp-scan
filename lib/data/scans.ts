import { getAdminClient } from "@/lib/supabase/admin";

export async function getScanHistory(limit = 30) {
  const supabase = getAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("radar_scans")
    .select("id,trigger_type,status,scan_date,started_at,finished_at,new_raw_items,new_signals,new_actionable,source_runs,source_failures,opportunities_snapshot_count,error_text,metadata")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getScanDetail(id: string) {
  const supabase = getAdminClient();
  if (!supabase) return null;

  const { data: scan, error } = await supabase.from("radar_scans").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!scan) return null;

  const [{ data: runs, error: runsError }, { data: opportunities, error: opportunitiesError }] = await Promise.all([
    supabase.from("collection_runs")
      .select("id,collector,status,records_seen,records_inserted,error_text,started_at,finished_at,sources(name,key)")
      .eq("scan_id", id)
      .order("started_at", { ascending: true }),
    supabase.from("radar_scan_opportunities")
      .select("*")
      .eq("scan_id", id)
      .order("rank", { ascending: true }),
  ]);
  if (runsError) throw runsError;
  if (opportunitiesError) throw opportunitiesError;

  return { scan, runs: runs || [], opportunities: opportunities || [] };
}
