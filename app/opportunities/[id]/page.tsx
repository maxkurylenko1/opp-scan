import Link from "next/link";
import { notFound } from "next/navigation";
import ScoreBar from "@/components/ScoreBar";
import { getOpportunity } from "@/lib/data/queries";
import { isAdminSession } from "@/lib/auth/admin";
import type { CompetitorView } from "@/lib/types";
import { refreshOpportunityBrief } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const [item, admin] = await Promise.all([getOpportunity(id), isAdminSession()]);
  if (!item) notFound();
  const plan = item.validationPlan;
  const brief = item.buildBrief;

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
        <h3>Why now</h3><p className="muted">{item.whyNow || "More evidence required."}</p>
        <h3>Suggested MVP</h3><p className="muted">{item.mvpScope || "Validate the painful workflow before building."}</p>
        <h3>Pricing hypothesis</h3><p className="muted">{item.pricingHypothesis || "Validate willingness to pay before setting price."}</p>
        <h3>Biggest risk</h3><p className="muted">{item.biggestRisk || "Current evidence may be too weak or too concentrated in one source."}</p>
      </div>

      <div className="panel" style={{ marginTop: 24 }}>
        <div className="section-heading">
          <div><p className="eyebrow">BUILD BRIEF {brief ? `· ${brief.readiness.replaceAll("_", " ")}` : ""}</p><h2>What exactly should be built?</h2></div>
          {admin && <form action={refreshOpportunityBrief}><input type="hidden" name="opportunityId" value={item.id} /><button type="submit">{brief ? "Regenerate brief" : "Generate brief"}</button></form>}
        </div>
        {!brief ? <p className="muted">No detailed brief yet. Run a manual Radar scan or generate it here as admin.</p> : <>
          <div className="meta">
            <div>Product type<strong>{brief.productType || "—"}</strong></div>
            <div>Build estimate<strong>{brief.buildDaysMin || "?"}–{brief.buildDaysMax || "?"} focused days</strong></div>
            <div>Validation<strong>{brief.validationDays || item.timeToValidationDays || "?"} days</strong></div>
            <div>Primary user<strong>{brief.primaryUser || item.targetCustomer || "—"}</strong></div>
          </div>

          <h3 style={{ marginTop: 20 }}>Build summary</h3><p className="muted">{brief.buildSummary}</p>
          <h3>Core job</h3><p className="muted">{brief.coreJob || "—"}</p>
          <h3>Must-have MVP</h3>
          <ol>{brief.mvpFeatures.map((x, i) => <li key={i} className="muted">{x}</li>)}</ol>
          <h3>User flow</h3>
          <ol>{brief.userFlow.map((x, i) => <li key={i} className="muted">{x}</li>)}</ol>
          <h3>Why it can work</h3><p className="muted">{brief.whyItCanWork || "—"}</p>
          <h3>Evidence basis</h3><p className="muted">{brief.evidenceBasis || "—"}</p>
          <h3>Technical approach</h3><p className="muted">{brief.technicalApproach || "—"}</p>
          <h3>First milestone</h3><p className="muted">{brief.firstMilestone || "—"}</p>
          <h3>Do NOT build yet</h3><ul>{brief.nonGoals.map((x, i) => <li key={i} className="muted">{x}</li>)}</ul>
          <h3>Risks & mitigation</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {brief.risks.map((risk, i) => <div className="card" key={i}><strong>{risk.severity.toUpperCase()} · {risk.risk}</strong><p className="muted">{risk.mitigation}</p></div>)}
          </div>
          <h3>Open unknowns</h3><ul>{brief.unknowns.map((x, i) => <li key={i} className="muted">{x}</li>)}</ul>
          <h3>Success definition</h3><p className="muted">{brief.successDefinition || "—"}</p>
          {brief.generatedAt && <p className="muted">Brief generated {new Date(brief.generatedAt).toLocaleString("en-GB")}</p>}
        </>}
      </div>

      {plan && (
        <div className="panel" style={{ marginTop: 24 }}>
          <div className="section-heading"><div><p className="eyebrow">VALIDATION ENGINE · {plan.verdict || "pending"}</p><h2>Paid validation plan</h2></div><Link href="/execution">Manage execution ↗</Link></div>
          <h3>Hypothesis</h3><p className="muted">{plan.hypothesis}</p>
          <h3>Offer</h3><p className="muted">{plan.offer || "—"}</p>
          <div className="meta" style={{ marginTop: 12 }}>
            <div>Price<strong>{plan.offerPrice != null ? `${plan.offerCurrency || ""} ${plan.offerPrice}`.trim() : "TBD"}</strong></div>
            <div>Prospects<strong>{plan.targetSampleSize || "—"}</strong></div>
            <div>Window<strong>{plan.maxDays ? `${plan.maxDays} days` : "—"}</strong></div>
            <div>Channel<strong>{plan.channel || "—"}</strong></div>
          </div>
          <div className="stats-grid" style={{ marginTop: 18 }}>
            <div className="stat-card"><span>Contacted</span><strong>{plan.contactedCount || 0}</strong></div>
            <div className="stat-card"><span>Replies</span><strong>{plan.repliedCount || 0}</strong></div>
            <div className="stat-card"><span>Qualified</span><strong>{plan.qualifiedCount || 0}</strong></div>
            <div className="stat-card"><span>Paid</span><strong>{plan.paidCount || 0} / {plan.successPaidTarget || "—"}</strong></div>
            <div className="stat-card"><span>Delivered</span><strong>{plan.deliveredCount || 0} / {plan.successDeliveredTarget ?? "—"}</strong></div>
            <div className="stat-card"><span>Revenue</span><strong>{plan.offerCurrency || "USD"} {Number(plan.revenueAmount || 0).toFixed(0)}</strong></div>
          </div>
          <h3>Who to contact</h3><p className="muted">{plan.audience || "—"}</p>
          <h3>Method</h3><p className="muted">{plan.method}</p>
          <h3>Success</h3><p className="muted"><strong>{plan.successMetric || "Metric"}:</strong> {plan.successThreshold || "—"}</p>
          <h3>Failure / stop</h3><p className="muted">{plan.failureThreshold || "—"}</p><p className="muted">Stop when: {plan.stopCondition || "—"}</p>
          <h3>First outreach</h3><div className="card" style={{ marginTop: 8 }}><p style={{ whiteSpace: "pre-wrap" }}>{plan.outreachMessage || "—"}</p></div>
          <h3>Follow-up</h3><div className="card" style={{ marginTop: 8 }}><p style={{ whiteSpace: "pre-wrap" }}>{plan.followupMessage || "—"}</p></div>
          {plan.notes && <><h3>Notes</h3><p className="muted">{plan.notes}</p></>}
        </div>
      )}

      {!plan && item.validationExperiment && <div className="panel" style={{ marginTop: 24 }}><p className="eyebrow">VALIDATION</p><h2>Suggested experiment</h2><p className="muted">{item.validationExperiment}</p></div>}

      {item.marketSummary && <div className="panel" style={{ marginTop: 24 }}><p className="eyebrow">MARKET RESEARCH</p><h2>Market reality</h2><p className="muted">{item.marketSummary}</p>{item.marketResearchedAt && <p className="muted">Researched {new Date(item.marketResearchedAt).toLocaleString("en-GB")}</p>}</div>}

      {!!item.competitors?.length && <section style={{ marginTop: 28 }}>
        <div className="section-heading"><div><p className="eyebrow">COMPETITORS</p><h2>Verified alternatives & pricing</h2></div></div>
        <div className="card-grid">{item.competitors.map((competitor) => <div className="card" key={`${competitor.name}-${competitor.url || "unknown"}`}><div className="card-top"><h3>{competitor.name}</h3><span className="badge">{priceLabel(competitor)}</span></div>{!!competitor.strengths?.length && <p className="muted">Strengths: {competitor.strengths.join(" · ")}</p>}{!!competitor.weaknesses?.length && <p className="muted">Weaknesses: {competitor.weaknesses.join(" · ")}</p>}{competitor.evidenceUrl && <a href={competitor.evidenceUrl} target="_blank" rel="noreferrer">Evidence source ↗</a>}</div>)}</div>
      </section>}

      {!!item.marketEvidence?.length && <div className="panel" style={{ marginTop: 28 }}><p className="eyebrow">EVIDENCE</p><h2>Web research trail</h2><div style={{ display: "grid", gap: 14 }}>{item.marketEvidence.map((evidence, index) => <div key={`${evidence.sourceUrl || "source"}-${index}`}><strong>{evidence.claimType}</strong><p className="muted">{evidence.excerpt || "Supporting source"}</p>{evidence.sourceUrl && <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a>}</div>)}</div></div>}
    </div>
  );
}
