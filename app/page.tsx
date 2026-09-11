import OpportunityCard from "@/components/OpportunityCard";
import { getDashboardData } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getDashboardData();
  return (
    <div className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">OPPORTUNITY RADAR V1</p>
          <h1>Find evidence-backed problems worth validating.</h1>
          <p className="muted">Signals → clusters → scores → validation. Opportunity Score and Confidence stay separate.</p>
        </div>
        <div className="hero-stat"><strong>{data.signalCount}</strong><span>signals</span></div>
      </section>

      <section className="stats-grid">
        <div className="stat-card"><span>Clusters</span><strong>{data.clusterCount}</strong></div>
        <div className="stat-card"><span>Opportunities</span><strong>{data.opportunities.length}</strong></div>
        <div className="stat-card"><span>Mode</span><strong>{data.mode}</strong></div>
      </section>

      <section>
        <div className="section-heading"><div><p className="eyebrow">RANKED</p><h2>Top opportunities</h2></div></div>
        <div className="card-grid">
          {data.opportunities.map((item) => <OpportunityCard key={item.id} item={item} />)}
        </div>
      </section>
    </div>
  );
}
