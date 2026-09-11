import Link from "next/link";
import ScoreBar from "./ScoreBar";
import type { OpportunityView } from "@/lib/types";

export default function OpportunityCard({ item }: { item: OpportunityView }) {
  return (
    <Link className="card" href={`/opportunities/${item.id}`}>
      <div className="card-top">
        <h3>{item.title}</h3>
        <div className="badge-row">
          {item.origin && <span className="badge">{item.origin}</span>}
          <span className="badge">{item.status}</span>
        </div>
      </div>
      <p className="muted">{item.thesis}</p>
      <div className="score-row">
        <ScoreBar label="Opportunity" value={item.opportunityScore}/>
        <ScoreBar label="Confidence" value={item.confidenceScore}/>
      </div>
      <div className="meta">
        <div>Customer<strong>{item.targetCustomer || "—"}</strong></div>
        <div>Validate<strong>{item.timeToValidationDays ? `${item.timeToValidationDays} days` : "—"}</strong></div>
      </div>
    </Link>
  );
}
