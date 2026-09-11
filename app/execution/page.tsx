import Link from "next/link";
import { redirect } from "next/navigation";
import CopyButton from "@/components/CopyButton";
import { isAdminSession } from "@/lib/auth/admin";
import { getExecutionBoardData } from "@/lib/data/execution";
import {
  addContact,
  discoverProspects,
  generateAllOutreach,
  generateContactOutreach,
  recalculateExperiment,
  setDiscoveryState,
  setOutreachState,
  updateContact,
} from "./actions";

export const dynamic = "force-dynamic";

const stages = ["prospect","contacted","replied","qualified","paid","delivered","lost"];

function fitLabel(contact: any) {
  if (!contact.outreach_fit_decision) return null;
  const score = contact.outreach_fit_score == null ? "" : ` ${Number(contact.outreach_fit_score).toFixed(0)}`;
  return `${contact.outreach_fit_decision}${score}`;
}

export default async function ExecutionPage() {
  const admin = await isAdminSession();
  if (!admin) redirect("/admin");
  const data = await getExecutionBoardData();

  return (
    <div className="page-shell">
      <div className="section-heading">
        <div><p className="eyebrow">V1.8 EXECUTION</p><h1>Validation CRM + Outreach Assistant</h1></div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <form action={discoverProspects}><button type="submit">Discover prospects</button></form>
          <form action={generateAllOutreach}><button type="submit">Generate missing drafts</button></form>
          <Link href="/">Dashboard</Link>
          <form action="/api/admin/logout" method="post"><button type="submit">Log out</button></form>
        </div>
      </div>
      <p className="muted">Radar finds prospects and prepares personalized drafts from public evidence. You review and copy them manually; V1.8 never sends messages automatically.</p>

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

              <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
                {experiment.contacts.length === 0 && <p className="muted">No prospects yet. Run discovery or add one manually.</p>}
                {experiment.contacts.map((contact: any) => {
                  const fit = fitLabel(contact);
                  const canApproveDraft = contact.outreach_state === "drafted" && contact.outreach_fit_decision !== "skip";
                  const hasDraft = Boolean(contact.outreach_message || contact.outreach_followup || contact.outreach_fit_decision);
                  const points = Array.isArray(contact.outreach_personalization) ? contact.outreach_personalization : [];

                  return (
                    <div className="card" key={contact.id}>
                      <div className="card-top">
                        <div>
                          <strong>{contact.name || contact.handle || "Unnamed prospect"}</strong>
                          <p className="muted">{contact.company || contact.source_kind || contact.handle || "—"}</p>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {contact.discovery_state && <span className="badge">{contact.discovery_state}</span>}
                          {contact.match_score != null && <span className="badge">match {Number(contact.match_score).toFixed(0)}</span>}
                          {contact.outreach_state && contact.outreach_state !== "none" && <span className="badge">draft {contact.outreach_state}</span>}
                          {fit && <span className="badge">fit {fit}</span>}
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
                            <button type="submit">Approve prospect</button>
                          </form>
                          <form action={setDiscoveryState}>
                            <input type="hidden" name="contactId" value={contact.id} />
                            <input type="hidden" name="discoveryState" value="dismissed" />
                            <button type="submit">Dismiss</button>
                          </form>
                        </div>
                      )}

                      <div className="panel" style={{ marginTop: 14 }}>
                        <div className="card-top">
                          <div>
                            <p className="eyebrow">V1.8 OUTREACH</p>
                            <h3>{hasDraft ? "Personalized draft" : "No draft yet"}</h3>
                          </div>
                          <form action={generateContactOutreach}>
                            <input type="hidden" name="contactId" value={contact.id} />
                            <button type="submit">{hasDraft ? "Regenerate" : "Generate draft"}</button>
                          </form>
                        </div>

                        {hasDraft && <>
                          {contact.outreach_fit_reason && (
                            <div style={{ marginTop: 10 }}>
                              <strong>Fit check</strong>
                              <p className="muted">{contact.outreach_fit_reason}</p>
                            </div>
                          )}

                          {points.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                              <strong>Personalization facts</strong>
                              <p className="muted">{points.join(" · ")}</p>
                            </div>
                          )}

                          {contact.outreach_channel && <p className="muted"><strong>Channel:</strong> {contact.outreach_channel}</p>}
                          {contact.outreach_rationale && <p className="muted"><strong>Why this wording:</strong> {contact.outreach_rationale}</p>}

                          {contact.outreach_fit_decision === "skip" ? (
                            <div className="card" style={{ marginTop: 12 }}>
                              <strong>Not recommended to send</strong>
                              <p className="muted">The exact validation offer does not fit this prospect well enough. Radar intentionally did not force a sales message.</p>
                            </div>
                          ) : <>
                            {contact.outreach_subject && (
                              <div style={{ marginTop: 12 }}>
                                <div className="card-top"><strong>Subject</strong><CopyButton text={contact.outreach_subject} /></div>
                                <textarea readOnly value={contact.outreach_subject} style={{ width: "100%", minHeight: 54, marginTop: 8 }} />
                              </div>
                            )}

                            {contact.outreach_message && (
                              <div style={{ marginTop: 12 }}>
                                <div className="card-top"><strong>First touch</strong><CopyButton text={contact.outreach_message} label="Copy first touch" /></div>
                                <textarea readOnly value={contact.outreach_message} style={{ width: "100%", minHeight: 150, marginTop: 8 }} />
                              </div>
                            )}

                            {contact.outreach_followup && (
                              <div style={{ marginTop: 12 }}>
                                <div className="card-top"><strong>Follow-up</strong><CopyButton text={contact.outreach_followup} label="Copy follow-up" /></div>
                                <textarea readOnly value={contact.outreach_followup} style={{ width: "100%", minHeight: 110, marginTop: 8 }} />
                              </div>
                            )}
                          </>}

                          {contact.outreach_state === "drafted" && (
                            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                              {canApproveDraft && (
                                <form action={setOutreachState}>
                                  <input type="hidden" name="contactId" value={contact.id} />
                                  <input type="hidden" name="outreachState" value="approved" />
                                  <button type="submit">Approve draft</button>
                                </form>
                              )}
                              <form action={setOutreachState}>
                                <input type="hidden" name="contactId" value={contact.id} />
                                <input type="hidden" name="outreachState" value="rejected" />
                                <button type="submit">Reject draft</button>
                              </form>
                            </div>
                          )}
                        </>}
                      </div>

                      <form action={updateContact} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr auto", gap: 8, alignItems: "center", marginTop: 14 }}>
                        <input type="hidden" name="contactId" value={contact.id} />
                        <select name="stage" defaultValue={contact.stage}>{stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select>
                        <input name="amountPaid" type="number" min="0" step="0.01" defaultValue={Number(contact.amount_paid || 0) || ""} placeholder="Paid" />
                        <input name="currency" defaultValue={contact.currency || experiment.offer_currency || "USD"} maxLength={3} />
                        <input name="notes" defaultValue={contact.notes || ""} placeholder="Notes" />
                        <button type="submit">Save CRM</button>
                      </form>
                      {contact.source_url && <a href={contact.source_url} target="_blank" rel="noreferrer">Open source ↗</a>}
                    </div>
                  );
                })}
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
