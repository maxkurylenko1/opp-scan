import { notFound } from "next/navigation";
import ScoreBar from "@/components/ScoreBar";
import { getOpportunity } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getOpportunity(id);
  if (!item) notFound();
  return <div className="page-shell"><p className="eyebrow">OPPORTUNITY</p><h1>{item.title}</h1><p className="muted">{item.thesis}</p><div className="panel" style={{marginTop:24}}><div className="score-row"><ScoreBar label="Opportunity" value={item.opportunityScore}/><ScoreBar label="Confidence" value={item.confidenceScore}/></div><h3>Why now</h3><p className="muted">{item.whyNow || "More evidence required."}</p><h3>Suggested MVP</h3><p className="muted">{item.mvpScope || "Validate the painful workflow before building."}</p><h3>Validation experiment</h3><p className="muted">{item.validationExperiment || "Interview 10 target users and ask for a commitment, not an opinion."}</p><h3>Biggest risk</h3><p className="muted">{item.biggestRisk || "Current evidence may be too weak or too concentrated in one source."}</p></div></div>;
}
