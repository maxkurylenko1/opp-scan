import { notFound } from "next/navigation";
import ScoreBar from "@/components/ScoreBar";
import { getOpportunity } from "@/lib/data/queries";
import type { CompetitorView } from "@/lib/types";

export const dynamic = "force-dynamic";

function priceLabel(item: CompetitorView) {
  if (item.priceMin == null && item.priceMax == null) return "Pricing not verified";
  const currency = item.currency || "";
  const min = item.priceMin == null ? null : `${currency} ${item.priceMin}`.trim();
  const max = item.priceMax == null ? null : `${currency} ${item.priceMax}`.trim();
  const price = min && max && min !== max ? `${min} – ${max}` : (min || max || "—");
  return item.billingPeriod ? `${price} / ${item.billingPeriod}` : price;
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getOpportunity(id);
  if (!item) notFound();

  return (
    <div className="page-shell">
      <p className="eyebrow">OPPORTUNITY · {item.origin || "exact"}</p>
      <h1>{item.title}</h1>
      <p className="muted">{item.thesis}</p>

      <div className="panel" style={{ marginTop: 24 }}>
        <div className="score-row">
          <ScoreBar label="Opportunity" value={item.opportunityScore} />
          <ScoreBar label="Confidence" value={item.confidenceScore} />
        </div>
        <h3>Why now</h3>
        <p className="muted">{item.whyNow || "More evidence required."}</p>
        <h3>Suggested MVP</h3>
        <p className="muted">{item.mvpScope || "Validate the painful workflow before building."}</p>
        <h3>Pricing hypothesis</h3>
        <p className="muted">{item.pricingHypothesis || "Validate willingness to pay before setting price."}</p>
        <h3>Validation experiment</h3>
        <p className="muted">{item.validationExperiment || "Interview 10 target users and ask for a commitment, not an opinion."}</p>
        <h3>Biggest risk</h3>
        <p className="muted">{item.biggestRisk || "Current evidence may be too weak or too concentrated in one source."}</p>
      </div>

      {item.marketSummary && (
        <div className="panel" style={{ marginTop: 24 }}>
          <p className="eyebrow">MARKET RESEARCH</p>
          <h2>Market reality</h2>
          <p className="muted">{item.marketSummary}</p>
          {item.marketResearchedAt && <p className="muted">Researched {new Date(item.marketResearchedAt).toLocaleString("en-GB")}</p>}
        </div>
      )}

      {!!item.competitors?.length && (
        <section style={{ marginTop: 28 }}>
          <div className="section-heading"><div><p className="eyebrow">COMPETITORS</p><h2>Verified alternatives & pricing</h2></div></div>
          <div className="card-grid">
            {item.competitors.map((competitor) => (
              <div className="card" key={`${competitor.name}-${competitor.url || "unknown"}`}>
                <div className="card-top">
                  <h3>{competitor.name}</h3>
                  <span className="badge">{priceLabel(competitor)}</span>
                </div>
                {!!competitor.strengths?.length && <p className="muted">Strengths: {competitor.strengths.join(" · ")}</p>}
                {!!competitor.weaknesses?.length && <p className="muted">Weaknesses: {competitor.weaknesses.join(" · ")}</p>}
                {competitor.evidenceUrl && <a href={competitor.evidenceUrl} target="_blank" rel="noreferrer">Evidence source ↗</a>}
              </div>
            ))}
          </div>
        </section>
      )}

      {!!item.marketEvidence?.length && (
        <div className="panel" style={{ marginTop: 28 }}>
          <p className="eyebrow">EVIDENCE</p>
          <h2>Web research trail</h2>
          <div style={{ display: "grid", gap: 14 }}>
            {item.marketEvidence.map((evidence, index) => (
              <div key={`${evidence.sourceUrl || "source"}-${index}`}>
                <strong>{evidence.claimType}</strong>
                <p className="muted">{evidence.excerpt || "Supporting source"}</p>
                {evidence.sourceUrl && <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
