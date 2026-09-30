import Link from "next/link";
import OpportunityCard from "@/components/OpportunityCard";
import { getDashboardData } from "@/lib/data/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function when(value?: string | null) {
  return value
    ? new Date(value).toLocaleString("en-GB", { timeZone: "Europe/Bratislava", dateStyle: "medium", timeStyle: "short" })
    : "—";
}

export default async function Home() {
  const data = await getDashboardData();

  return (
    <div className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">OPPORTUNITY RADAR V2</p>
          <h1>Find evidence-backed problems worth validating.</h1>
          <p className="muted">Signals → clusters → market-specific snapshots → validation. US and Europe are ranked separately.</p>
        </div>
        <div className="hero-stat"><strong>{data.signalCount}</strong><span>signals</span></div>
      </section>

      <section className="stats-grid">
        <div className="stat-card"><span>Clusters</span><strong>{data.clusterCount}</strong></div>
        <div className="stat-card"><span>US opportunities</span><strong>{data.markets.us.length}</strong></div>
        <div className="stat-card"><span>EU opportunities</span><strong>{data.markets.eu.length}</strong></div>
        <div className="stat-card"><span>Mode</span><strong>{data.mode}</strong></div>
      </section>

      {data.latestScan && (
        <section className="panel" style={{ marginBottom: 28 }}>
          <div className="section-heading" style={{ marginBottom: 0 }}>
            <div>
              <p className="eyebrow">LATEST COMPLETED SNAPSHOT</p>
              <h2>{when(data.latestScan.startedAt)}</h2>
              <p className="muted">
                {data.latestScan.status} · {data.latestScan.snapshotCount} saved opportunities ·
                dashboard is reading this immutable scan snapshot.
              </p>
            </div>
            <Link href={`/admin/scans/${data.latestScan.id}`}>Open scan ↗</Link>
          </div>
        </section>
      )}

      {!!data.earlyLeads.length && (
        <section style={{ marginBottom: 42 }}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">EARLY RESEARCH · UNVALIDATED</p>
              <h2>Problems worth checking</h2>
              <p className="muted">
                Manually reviewed problem reports and follow-up references as of 30 Sep 2026.
                Independent user reports are separate from related workflows, product documentation
                and existing solutions. None of these research notes affect Opportunity scores,
                buyer confidence or the US/EU Top-5.
              </p>
            </div>
          </div>
          <div className="card-grid">
            {data.earlyLeads.map((lead) => (
              <article className="card" key={lead.id}>
                <div className="card-top">
                  <span className="eyebrow">{lead.sourceName}</span>
                  <span className="badge">
                    {lead.independentReportCount} independent {lead.independentReportCount === 1 ? "report" : "reports"}
                  </span>
                </div>
                <h3 style={{ marginTop: 14 }}>{lead.problem}</h3>
                <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
                  <strong style={{ color: "#e7ecfb" }}>Next check: </strong>
                  {lead.nextCheck}
                </p>
                {lead.marketAudit && (
                  <details style={{ marginTop: 16, borderTop: "1px solid #33446e", paddingTop: 14 }}>
                    <summary style={{ cursor: "pointer", fontSize: 13, color: "#bcd0ff", fontWeight: 700 }}>
                      Current market check · {lead.marketAudit.reviewedAt}
                    </summary>
                    <div style={{ marginTop: 12, display: "grid", gap: 12, fontSize: 13, lineHeight: 1.55 }}>
                      <div><strong>Current capability / open question</strong><p className="muted" style={{ margin: "4px 0 0" }}>{lead.marketAudit.currentProductState}</p></div>
                      <div><strong>Existing alternatives</strong><p className="muted" style={{ margin: "4px 0 0" }}>{lead.marketAudit.existingAlternatives}</p></div>
                      <div><strong>Unresolved gap hypothesis</strong><p className="muted" style={{ margin: "4px 0 0" }}>{lead.marketAudit.remainingGapHypothesis}</p></div>
                      <div><strong>Willingness to pay: unverified</strong><p className="muted" style={{ margin: "4px 0 0" }}>No paid pilots, deposits or purchase commitments were verified for this particular solution.</p></div>
                      <div>
                        <strong>Validation experiment</strong>
                        <ol className="muted" style={{ margin: "6px 0 0", paddingLeft: 19 }}>
                          {lead.marketAudit.validationSteps.map((step) => <li key={step} style={{ marginBottom: 6 }}>{step}</li>)}
                        </ol>
                      </div>
                      <div><strong>Stop condition</strong><p className="muted" style={{ margin: "4px 0 0" }}>{lead.marketAudit.stopCondition}</p></div>
                    </div>
                  </details>
                )}

                <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
                  <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#bcd0ff", textDecoration: "underline" }}>
                    Original report · {when(lead.publishedAt)} ↗
                  </a>
                  {lead.researchReferences.map((reference) => (
                    <div key={reference.url}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 9 }}>
                        <a href={reference.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#bcd0ff", textDecoration: "underline" }}>
                          {reference.label} ↗
                        </a>
                        <span className="muted" style={{ fontSize: 11 }}>
                          {reference.kind === "independent_report"
                            ? "Independent report"
                            : reference.kind === "related_workflow"
                              ? "Related workflow, not direct confirmation"
                              : reference.kind === "existing_solution"
                                ? "Existing solution / competition"
                                : "Technical context only"}
                        </span>
                      </div>
                      <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                        {reference.note}
                      </p>
                    </div>
                  ))}
                  <span className="muted" style={{ fontSize: 12 }}>
                    Manual review: {lead.reviewedAt}. Independent reports are not proof of
                    current product gaps, willingness to pay or market demand.
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">🇺🇸 US RADAR</p>
            <h2>Top opportunities · United States</h2>
            <p className="muted">Ranked independently using US-specific paid-demand and location evidence plus global developer signals.</p>
          </div>
        </div>
        <div className="card-grid">
          {data.markets.us.map((item) => <OpportunityCard key={item.id} item={item} />)}
        </div>
        {!data.markets.us.length && <div className="empty">No US opportunity has passed the current evidence gates. Review early research leads above while independent evidence accumulates.</div>}
      </section>

      <section style={{ marginTop: 42 }}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">🇪🇺 EUROPE RADAR</p>
            <h2>Top opportunities · Europe</h2>
            <p className="muted">Separate ranking for EU/UK/CH/EEA-oriented evidence. Global opportunities remain eligible, but explicit European demand boosts the score.</p>
          </div>
        </div>
        <div className="card-grid">
          {data.markets.eu.map((item) => <OpportunityCard key={item.id} item={item} />)}
        </div>
        {!data.markets.eu.length && <div className="empty">No European opportunity has passed the current evidence gates. Review early research leads above while independent evidence accumulates.</div>}
      </section>
    </div>
  );
}
