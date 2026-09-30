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
                Individually reviewed original reports, not ranked opportunities.
                Each currently has one source and still needs independent corroboration
                before it can support an investment or product decision.
              </p>
            </div>
          </div>
          <div className="card-grid">
            {data.earlyLeads.map((lead) => (
              <article className="card" key={lead.id}>
                <div className="card-top">
                  <span className="eyebrow">{lead.sourceName}</span>
                  <span className="badge">1 original report</span>
                </div>
                <h3 style={{ marginTop: 14 }}>{lead.problem}</h3>
                <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
                  <strong style={{ color: "#e7ecfb" }}>Next check: </strong>
                  {lead.nextCheck}
                </p>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {when(lead.publishedAt)} · No independent confirmation
                  </span>
                  <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#bcd0ff", textDecoration: "underline" }}>
                    Original source ↗
                  </a>
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
