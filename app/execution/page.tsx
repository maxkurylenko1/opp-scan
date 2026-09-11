import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/auth/admin";
import { getExecutionBoardData } from "@/lib/data/execution";
import { addContact, discoverProspects, recalculateExperiment, setDiscoveryState, updateContact } from "./actions";

export const dynamic = "force-dynamic";

const stages = ["prospect","contacted","replied","qualified","paid","delivered","lost"];

export default async function ExecutionPage() {
  const admin = await isAdminSession();
  if (!admin) redirect("/admin");
  const data = await getExecutionBoardData();

  return (
    <div className="page-shell">
      <div className="section-heading">
        <div><p className="eyebrow">V1.7 EXECUTION</p><h1>Validation CRM + Prospect Discovery</h1></div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <form action={discoverProspects}><button type="submit">Discover prospects now</button></form>
          <Link href="/">Dashboard</Link>
          <form action="/api/admin/logout" method="post"><button type="submit">Log out</button></form>
        </div>
      </div>
      <p className="muted">Radar suggests public, relevant prospects from existing evidence. You review them first; it never sends outreach automatically.</p>

      <div style={{ display: "grid", gap: 28, marginTop: 28 }}>
        {data.experiments.map((experiment: any) => {
          const m = experiment.metrics;
          return (
            <section className="panel" key={experiment.id} id={`experiment-${experiment.id}`}>
              <div className="card-top">
                <div>
                  <p className="eyebrow">{experiment.execution_state} · {experiment.verdict}</p>
                  <h2>{experiment.opportunity?.title || "Validation experiment"}</h2>
                </div>
                <Link href={`/opportunities/${experiment.opportunity_id}`}>Opportunity ↗</Link>
              </div>

              <div className="stats-grid" style={{ marginTop: 18 }}>
                <div className="stat-card"><span>Prospects</span><strong>{m.prospects}</strong></div>
                <div className="stat-card"><span>Suggested</span><strong>{m.suggested}</strong></div>
                <div className="stat-card"><span>Contacted</span><strong>{m.contacted}</strong></div>
                <div className="stat-card"><span>Replies</span><strong>{m.replied}</strong></div>
                <div className="stat-card"><span>Qualified</span><strong>{m.qualified}</strong></div>
                <div className="stat-card"><span>Paid</span><strong>{m.paid}</strong></div>
                <div className="stat-card"><span>Delivered</span><strong>{m.delivered}</strong></div>
                <div className="stat-card"><span>Revenue</span><strong>{experiment.offer_currency || "USD"} {m.revenue.toFixed(0)}</strong></div>
              </div>

              <p className="muted" style={{ marginTop: 14 }}>
                Auto-pass at {experiment.success_paid_count || 3} paid / {experiment.success_delivered_count || 2} delivered. Auto-fail after {experiment.failure_contact_limit || experiment.target_sample_size || 30} contacted if paid &lt; {experiment.failure_paid_below_count || 2}.
              </p>

              <form action={addContact} className="panel" style={{ marginTop: 18 }}>
                <input type="hidden" name="experimentId" value={experiment.id} />
                <h3>Add prospect manually</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                  <input name="name" placeholder="Name" />
                  <input name="handle" placeholder="Email / handle" />
                  <input name="company" placeholder="Company" />
                  <input name="sourceKind" placeholder="Source" />
                  <input name="sourceUrl" placeholder="Profile / thread URL" />
                  <input name="notes" placeholder="Notes" />
                </div>
                <button type="submit" style={{ marginTop: 10 }}>Add prospect</button>
              </form>

              <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
                {experiment.contacts.length === 0 && <p className="muted">No prospects yet. Run discovery or add one manually.</p>}
                {experiment.contacts.map((contact: any) => (
                  <div className="card" key={contact.id}>
                    <div className="card-top">
                      <div>
                        <strong>{contact.name || contact.handle || "Unnamed prospect"}</strong>
                        <p className="muted">{contact.company || contact.source_kind || contact.handle || "—"}</p>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {contact.discovery_state && <span className="badge">{contact.discovery_state}</span>}
                        {contact.match_score != null && <span className="badge">match {Number(contact.match_score).toFixed(0)}</span>}
                        <span className="badge">{contact.stage}</span>
                      </div>
                    </div>

                    {contact.discovery_reason && (
                      <div style={{ marginTop: 10 }}>
                        <strong>Why Radar suggested this</strong>
                        <p className="muted">{contact.discovery_reason}</p>
                      </div>
                    )}

                    {contact.discovery_state === "suggested" && (
                      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
                        <form action={setDiscoveryState}>
                          <input type="hidden" name="contactId" value={contact.id} />
                          <input type="hidden" name="discoveryState" value="approved" />
                          <button type="submit">Approve</button>
                        </form>
                        <form action={setDiscoveryState}>
                          <input type="hidden" name="contactId" value={contact.id} />
                          <input type="hidden" name="discoveryState" value="dismissed" />
                          <button type="submit">Dismiss</button>
                        </form>
                      </div>
                    )}

                    <form action={updateContact} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr auto", gap: 8, alignItems: "center" }}>
                      <input type="hidden" name="contactId" value={contact.id} />
                      <select name="stage" defaultValue={contact.stage}>{stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select>
                      <input name="amountPaid" type="number" min="0" step="0.01" defaultValue={Number(contact.amount_paid || 0) || ""} placeholder="Paid" />
                      <input name="currency" defaultValue={contact.currency || experiment.offer_currency || "USD"} maxLength={3} />
                      <input name="notes" defaultValue={contact.notes || ""} placeholder="Notes" />
                      <button type="submit">Save</button>
                    </form>
                    {contact.source_url && <a href={contact.source_url} target="_blank" rel="noreferrer">Open source ↗</a>}
                  </div>
                ))}
              </div>

              <form action={recalculateExperiment} style={{ marginTop: 18 }}>
                <input type="hidden" name="experimentId" value={experiment.id} />
                <button type="submit">Recalculate verdict</button>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}
