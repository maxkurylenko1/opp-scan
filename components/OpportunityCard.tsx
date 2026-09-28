import Link from "next/link";
import ScoreBar from "./ScoreBar";
import type { OpportunityView } from "@/lib/types";

export default function OpportunityCard({ item }: { item: OpportunityView }) {
  const problemConfidence = item.problemConfidenceScore ?? item.confidenceScore;
  const productConfidence = item.productConfidenceScore ?? item.confidenceScore;

  return (
    <Link className="card" href={`/opportunities/${item.id}`}>
      <div className="card-top">
        <h3>{item.title}</h3>
        <div className="badge-row">
          {item.decisionTier && <span className="badge">{item.decisionTier}</span>}
          {item.origin && <span className="badge">{item.origin}</span>}
        </div>
      </div>
      <p className="muted">{item.thesis}</p>
      <div className="score-row">
        <ScoreBar label="Opportunity" value={item.opportunityScore}/>
        <ScoreBar label="Product proof" value={productConfidence}/>
      </div>
      <div className="meta">
        <div>Problem evidence<strong>{problemConfidence.toFixed(0)} / 100</strong></div>
        <div>Validate<strong>{item.timeToValidationDays ? `${item.timeToValidationDays} days` : "—"}</strong></div>
      </div>
    </Link>
  );
}
