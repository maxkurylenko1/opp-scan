import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/auth/admin";
import { getExecutionBoardData } from "@/lib/data/execution";
import { addLead, recalculateExperiment, updateLead } from "./actions";

export const dynamic = "force-dynamic";

const stages = ["new","contacted","replied","qualified","paid","delivered","lost"];

export default async function ExecutionPage() {
  const admin = await isAdminSession();
  if (!admin) redirect("/admin");
  const data = await getExecutionBoardData();

  return (
    <div className="page-shell">
      <div className="section-heading">
        <div><p className="eyebrow">V1.6 EXECUTION</p><h1>Validation CRM</h1></div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/">Dashboard</Link>
          <form action="/api/admin/logout" method="post"><button type="submit">Log out</button></form>
        </div>
      </div>
      <p className="muted">Track outreach → replies → paid pilots → delivery. Pass/fail is calculated from real execution data.</p>

      <div style={{ display: "grid", gap: 28, marginTop: 28 }}>
        {data.experiments.map((experiment: any) => (
          <section className="panel" key={experiment.id} id={`experiment-${experiment.id}`}>
            <div className="card-top">
              <div>
                <p className="eyebrow">{experiment.executionState} · {experiment.verdict}</p>
                <h2>{experiment.opportunity?.title || "Validation experiment"}</h2>
              </div>
              <Link href={`/opportunities/${experiment.opportunity_id}`}>Opportunity ↗</Link>
            </div>

            <div className="stats-grid" style={{ marginTop: 18 }}>
              <div className="stat-card"><span>Prospects</span><strong>{experiment.leads.length}</strong></div>
              <div className="stat-card"><span>Contacted</span><strong>{experiment.contacted_count || 0}</strong></div>
              <div className="stat-card"><span>Replies</span><strong>{experiment.replied_count || 0}</strong></div>
              <div className="stat-card"><span>Qualified</span><strong>{experiment.qualified_count || 0}</strong></div>
              <div className="stat-card"><span>Paid</span><strong>{experiment.paid_count || 0}</strong></div>
              <div className="stat-card"><span>Delivered</span><strong>{experiment.delivered_count || 0}</strong></div>
              <div className="stat-card"><span>Lost</span><strong>{experiment.lost_count || 0}</strong></div>
              <div className="stat-card"><span>Revenue</span><strong>{experiment.offer_currency || "USD"} {Number(experiment.revenue_amount || 0).toFixed(0)}</strong></div>
            </div>

            <p className="muted" style={{ marginTop: 14 }}>
              Auto-pass at {experiment.success_paid_target || 0} paid / {experiment.success_delivered_target || 0} delivered. Auto-fail after {experiment.target_sample_size || 0} contacted if paid ≤ {experiment.failure_max_paid ?? 0}.
            </p>

            <form action={addLead} className="panel" style={{ marginTop: 18 }}>
              <input type="hidden" name="experimentId" value={experiment.id} />
              <h3>Add prospect</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                <input name="name" placeholder="Name" />
                <input name="contactDetail" placeholder="Email / handle" />
                <input name="source" placeholder="Source" />
                <input name="profileUrl" placeholder="Profile / thread URL" />
                <input name="notes" placeholder="Notes" />
              </div>
              <button type="submit" style={{ marginTop: 10 }}>Add prospect</button>
            </form>

            <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
              {experiment.leads.length === 0 && <p className="muted">No prospects added yet.</p>}
              {experiment.leads.map((lead: any) => (
                <div className="card" key={lead.id}>
                  <div className="card-top">
                    <div>
                      <strong>{lead.name}</strong>
                      <p className="muted">{lead.contact_detail || lead.source || "—"}</p>
                    </div>
                    <span className="badge">{lead.status}</span>
                  </div>
                  <form action={updateLead} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr auto", gap: 8, alignItems: "center" }}>
                    <input type="hidden" name="leadId" value={lead.id} />
                    <select name="status" defaultValue={lead.status}>{stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select>
                    <input name="paidAmount" type="number" min="0" step="0.01" defaultValue={lead.paid_amount == null ? "" : Number(lead.paid_amount)} placeholder="Paid" />
                    <input name="currency" defaultValue={lead.paid_currency || experiment.offer_currency || "USD"} maxLength={3} />
                    <input name="notes" defaultValue={lead.notes || ""} placeholder="Notes" />
                    <button type="submit">Save</button>
                  </form>
                  {lead.profile_url && <a href={lead.profile_url} target="_blank" rel="noreferrer">Source ↗</a>}
                </div>
              ))}
            </div>

            <form action={recalculateExperiment} style={{ marginTop: 18 }}>
              <input type="hidden" name="experimentId" value={experiment.id} />
              <button type="submit">Recalculate verdict</button>
            </form>
          </section>
        ))}
      </div>
    </div>
  );
}
