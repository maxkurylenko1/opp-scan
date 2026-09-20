import Link from "next/link";
import { redirect } from "next/navigation";
import ScanButton from "@/components/ScanButton";
import { isAdminSession } from "@/lib/auth/admin";
import { getScanHistory } from "@/lib/data/scans";
import { runManualScanAction } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function when(value: string) {
  return new Date(value).toLocaleString("en-GB", { timeZone: "Europe/Bratislava", dateStyle: "medium", timeStyle: "short" });
}

function duration(start: string, end?: string | null) {
  if (!end) return "running";
  const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default async function ScansPage() {
  if (!(await isAdminSession())) redirect("/admin");
  const scans = await getScanHistory();

  return (
    <div className="page-shell">
      <div className="section-heading">
        <div><p className="eyebrow">ADMIN · RADAR SCANS</p><h1>Scan history</h1></div>
        <div style={{ display: "flex", gap: 12 }}><Link href="/admin">Admin</Link><Link href="/execution">Execution</Link></div>
      </div>

      <div className="panel">
        <h2>Run Radar now</h2>
        <p className="muted">Runs all collectors, processes new signals, semantic clustering/ranking, refreshes stale market research, generates missing validation plans and detailed build briefs, then saves an immutable top-10 snapshot.</p>
        <form action={runManualScanAction} style={{ marginTop: 14 }}><ScanButton /></form>
        <p className="muted" style={{ marginTop: 10 }}>GitHub Actions are not involved in a scan. This runs against production services directly.</p>
      </div>

      <section style={{ marginTop: 28 }}>
        <div className="section-heading"><div><p className="eyebrow">HISTORY</p><h2>Separated runs</h2></div></div>
        <div style={{ display: "grid", gap: 14 }}>
          {scans.map((scan: any) => (
            <Link className="card" href={`/admin/scans/${scan.id}`} key={scan.id}>
              <div className="card-top">
                <div>
                  <p className="eyebrow">{scan.trigger_type} · {scan.status}</p>
                  <h3>{when(scan.started_at)}</h3>
                </div>
                <span className="badge">{duration(scan.started_at, scan.finished_at)}</span>
              </div>
              <div className="meta" style={{ marginTop: 14 }}>
                <div>New raw<strong>{scan.new_raw_items}</strong></div>
                <div>New signals<strong>{scan.new_signals}</strong></div>
                <div>Actionable<strong>{scan.new_actionable}</strong></div>
                <div>Sources<strong>{scan.source_runs} runs / {scan.source_failures} failed</strong></div>
                <div>Snapshot<strong>{scan.opportunities_snapshot_count} opportunities</strong></div>
                <div>Date key<strong>{scan.scan_date}</strong></div>
              </div>
              {scan.metadata?.historical_backfill && <p className="muted">Historical collection-only scan: opportunity snapshots were not available retroactively.</p>}
            </Link>
          ))}
          {!scans.length && <div className="empty">No scans yet.</div>}
        </div>
      </section>
    </div>
  );
}
