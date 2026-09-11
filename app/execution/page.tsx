import Link from "next/link";
import { isAdminSession } from "@/lib/auth/admin";
import { getExecutionBoardData } from "@/lib/data/execution";
import { addContact, setExperimentVerdict, updateContact } from "./actions";

export const dynamic = "force-dynamic";

const stages = ["prospect","contacted","replied","qualified","paid","delivered","lost"];

export default async function ExecutionPage() {
  const [admin, data] = await Promise.all([isAdminSession(), getExecutionBoardData()]);

  return (
    <div className="page-shell">
      <div className="section-heading">
        <div><p className="eyebrow">V1.6 EXECUTION</p><h1>Validation CRM</h1></div>
        <div>{admin ? <form action="/api/admin/logout" method="post"><button type="submit">Log out</button></form> : <Link href="/admin">Admin login</Link>}</div>
      </div>
      <p className="muted">Track outreach → replies → paid pilots → delivered work. Verdicts update automatically from real execution data.</p>

      <div style={{ display: "grid", gap: 28, marginTop: 28 }}>
        {data.experiments.map((experiment: any) => {
          const m = experiment.metrics;
          return (
            <section className="panel" key={experiment.id}>
              <div className="card-top">
                <div>
                  <p className="eyebrow">{experiment.execution_state} · {experiment.verdict}</p>
                  <h2>{experiment.opportunity?.title || "Validation experiment"}</h2>
                </div>
                <Link href={`/opportunities/${experiment.opportunity_id}`}>Opportunity ↗</Link>
              </div>

              <div className="stats-grid" style={{ marginTop: 18 }}>
                <div className="stat-card"><span>Prospects</span><strong>{m.prospects}</strong></div>
                <div className="stat-card"><span>Contacted</span><strong>{m.contacted}</strong></div>
                <div className="stat-card"><span>Replies</span><strong>{m.replied}</strong></div>
                <div className="stat-card"><span>Paid</span><strong>{m.paid}</strong></div>
                <div className="stat-card"><span>Delivered</span><strong>{m.delivered}</strong></div>
                <div className="stat-card"><span>Revenue</span><strong>${m.revenue.toFixed(0)}</strong></div>
              </div>

              <p className="muted" style={{ marginTop: 14 }}>Goal: {experiment.success_paid_count} paid / {experiment.success_delivered_count} delivered. Fail check after {experiment.failure_contact_limit || experiment.target_sample_size || 30} contacted.</p>

              {admin && (
                <form action={addContact} className="panel" style={{ marginTop: 18 }}>
                  <input type="hidden" name="experimentId" value={experiment.id} />
                  <h3>Add prospect</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                    <input name="name" placeholder="Name" />
                    <input name="handle" placeholder="Handle / email" />
                    <input name="company" placeholder="Company" />
                    <input name="sourceKind" placeholder="Source (Reddit, Upwork...)" />
                    <input name="sourceUrl" placeholder="Source URL" />
                    <input name="notes" placeholder="Notes" />
                  </div>
                  <button type="submit" style={{ marginTop: 10 }}>Add prospect</button>
                </form>
              )}

              <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
                {experiment.contacts.length === 0 && <p className="muted">No prospects added yet.</p>}
                {experiment.contacts.map((contact: any) => (
                  <div className="card" key={contact.id}>
                    <div className="card-top">
                      <div><strong>{contact.name || contact.handle || "Unnamed prospect"}</strong><p className="muted">{contact.company || contact.source_kind || "—"}</p></div>
                      <span className="badge">{contact.stage}</span>
                    </div>
                    {admin ? (
                      <form action={updateContact} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr auto", gap: 8, alignItems: "center" }}>
                        <input type="hidden" name="contactId" value={contact.id} />
                        <select name="stage" defaultValue={contact.stage}>{stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select>
                        <input name="amountPaid" type="number" min="0" step="0.01" defaultValue={Number(contact.amount_paid || 0)} placeholder="Paid" />
                        <input name="currency" defaultValue={contact.currency || "USD"} maxLength={3} />
                        <input name="notes" defaultValue={contact.notes || ""} placeholder="Notes" />
                        <button type="submit">Save</button>
                      </form>
                    ) : <p className="muted">{contact.notes || contact.handle || ""}</p>}
                  </div>
                ))}
              </div>

              {admin && (
                <form action={setExperimentVerdict} style={{ marginTop: 18, display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="hidden" name="experimentId" value={experiment.id} />
                  <select name="verdict" defaultValue={experiment.verdict}>{["pending","pass","fail","inconclusive"].map((v) => <option key={v}>{v}</option>)}</select>
                  <button type="submit">Set verdict</button>
                </form>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
