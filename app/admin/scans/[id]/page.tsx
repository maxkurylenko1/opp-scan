import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdminSession } from "@/lib/auth/admin";
import { getScanDetail } from "@/lib/data/scans";

export const dynamic = "force-dynamic";

function when(value: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { timeZone: "Europe/Bratislava", dateStyle: "medium", timeStyle: "medium" }) : "—";
}

export default async function ScanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) redirect("/admin");
  const { id } = await params;
  const data = await getScanDetail(id);
  if (!data) notFound();
  const { scan, runs, opportunities } = data;
  const analysis = scan.metadata || {};

  return (
    <div className="page-shell">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SCAN · {scan.trigger_type} · {scan.status}</p>
          <h1>{when(scan.started_at)}</h1>
          <p className="muted">Finished: {when(scan.finished_at)} · ID {scan.id}</p>
        </div>
        <Link href="/admin/scans">All scans ↗</Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><span>New raw</span><strong>{scan.new_raw_items}</strong></div>
        <div className="stat-card"><span>New signals</span><strong>{scan.new_signals}</strong></div>
        <div className="stat-card"><span>Actionable</span><strong>{scan.new_actionable}</strong></div>
        <div className="stat-card"><span>Source failures</span><strong>{scan.source_failures}</strong></div>
        <div className="stat-card"><span>Opportunities</span><strong>{scan.opportunities_snapshot_count}</strong></div>
      </div>

      {!!scan.error_text && <div className="panel" style={{ marginBottom: 24 }}><p className="eyebrow">WARNINGS</p><p className="muted" style={{ whiteSpace: "pre-wrap" }}>{scan.error_text}</p></div>}

      <div className="panel">
        <p className="eyebrow">SOURCES</p>
        <h2>Collector results</h2>
        <table className="table">
          <thead><tr><th>Source</th><th>Status</th><th>Seen</th><th>Inserted</th><th>Started</th></tr></thead>
          <tbody>
            {runs.map((run: any) => {
              const source = Array.isArray(run.sources) ? run.sources[0] : run.sources;
              return <tr key={run.id}>
                <td>{source?.name || run.collector}</td><td>{run.status}</td><td>{run.records_seen ?? 0}</td><td>{run.records_inserted ?? 0}</td><td>{when(run.started_at)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>

      {(analysis.semantic || analysis.marketResearch || analysis.briefs) && (
        <div className="panel" style={{ marginTop: 24 }}>
          <p className="eyebrow">ANALYSIS PIPELINE</p>
          <h2>What Radar did after collection</h2>
          <div className="meta">
            <div>Semantic<strong>{analysis.semantic ? `${analysis.semantic.processed ?? analysis.semantic.candidates ?? "done"} processed` : "—"}</strong></div>
            <div>Market research<strong>{analysis.marketResearch ? `${analysis.marketResearch.researched ?? 0} refreshed` : "—"}</strong></div>
            <div>Validation plans<strong>{analysis.validations ? `${analysis.validations.generated ?? 0} generated` : "—"}</strong></div>
            <div>Build briefs<strong>{analysis.briefs ? `${analysis.briefs.generated ?? 0} generated · ${analysis.briefs.skipped ?? 0} reused` : "—"}</strong></div>
          </div>
        </div>
      )}

      <section style={{ marginTop: 30 }}>
        <div className="section-heading"><div><p className="eyebrow">SNAPSHOT</p><h2>Opportunities found in this scan</h2></div></div>
        <div style={{ display: "grid", gap: 18 }}>
          {opportunities.map((item: any) => {
            const brief = item.brief || null;
            const risks = Array.isArray(brief?.risks) ? brief.risks : [];
            return (
              <div className="card" key={item.id}>
                <div className="card-top">
                  <div><p className="eyebrow">#{item.rank} · {item.origin} · {item.status}</p><h3>{item.title}</h3></div>
                  <div className="badge-row"><span className="badge">score {Number(item.opportunity_score).toFixed(1)}</span><span className="badge">confidence {Number(item.confidence_score).toFixed(1)}</span></div>
                </div>
                <p className="muted">{item.thesis}</p>
                {brief ? <>
                  <div className="meta" style={{ marginTop: 14 }}>
                    <div>Readiness<strong>{String(brief.readiness || "unknown").replaceAll("_", " ")}</strong></div>
                    <div>Type<strong>{brief.product_type || "—"}</strong></div>
                    <div>Build estimate<strong>{brief.build_days_min || "?"}–{brief.build_days_max || "?"} days</strong></div>
                    <div>Validate<strong>{brief.validation_days || item.time_to_validation_days || "?"} days</strong></div>
                  </div>
                  <h3 style={{ marginTop: 18 }}>What to build</h3><p className="muted">{brief.build_summary}</p>
                  <h3>Why it can work</h3><p className="muted">{brief.why_it_can_work}</p>
                  {!!risks.length && <><h3>Top risks</h3>{risks.slice(0, 3).map((risk: any, index: number) => <p className="muted" key={index}><strong>{risk.severity}: {risk.risk}</strong> — {risk.mitigation}</p>)}</>}
                </> : <>
                  <h3 style={{ marginTop: 18 }}>Suggested MVP</h3><p className="muted">{item.mvp_scope || "Detailed build brief was not available for this historical snapshot."}</p>
                  <h3>Biggest risk</h3><p className="muted">{item.biggest_risk || "—"}</p>
                </>}
                {item.opportunity_id && <Link href={`/opportunities/${item.opportunity_id}`}>Open full opportunity brief ↗</Link>}
              </div>
            );
          })}
          {!opportunities.length && <div className="empty">This is a historical collection-only scan; no immutable opportunity snapshot was captured at that time.</div>}
        </div>
      </section>
    </div>
  );
}
