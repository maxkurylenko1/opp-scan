import Link from "next/link";
import { isAdminSession } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUSES = ["new", "research", "validate", "archived"] as const;

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("en-GB", {
    timeZone: "Europe/Bratislava", dateStyle: "medium", timeStyle: "short",
  }) : "Not yet";
}

function displayType(type: string) {
  switch (type) {
    case "related_report": return "Potential independent problem report";
    case "service_spend": return "Potential matching paid work (not SaaS demand)";
    case "potential_competitor": return "Possible competing launch (not demand)";
    case "market_context": return "Related platform release (context only)";
    default: return type;
  }
}

export default async function ResearchInbox({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; message?: string }>;
}) {
  if (!(await isAdminSession())) {
    return (
      <div className="page-shell">
        <p className="eyebrow">RESEARCH QUEUE</p>
        <h1>Admin session required</h1>
        <p className="muted">Research notes and review actions are private. Sign in with your admin password.</p>
        <Link href="/admin" style={{ color: "#bcd0ff", textDecoration: "underline" }}>Open admin login ↗</Link>
      </div>
    );
  }

  const params = await searchParams;
  const filter = STATUSES.includes(params.status as typeof STATUSES[number]) ? params.status : "all";
  const db = getAdminClient();
  if (!db) return <div className="page-shell"><h1>Supabase is not configured</h1></div>;

  let query = db.from("research_leads")
    .select("id,source_url,source_key,title,problem,evidence_role,origin,status,decision_reason,research_notes,created_at,updated_at,reviewed_at,last_scanned_at,research_lead_refs(id,source_key,source_url,title,suggestion_type,similarity,review_status,reviewer_note)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter !== "all") query = query.eq("status", filter);
  const { data, error } = await query;
  if (error) throw error;

  const leads = (data || []).sort((a: any, b: any) => {
    const priority: Record<string, number> = { new: 0, research: 1, validate: 2, archived: 3 };
    return (priority[a.status] ?? 4) - (priority[b.status] ?? 4)
      || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const counts = leads.reduce((result: Record<string, number>, lead: any) => {
    result[lead.status] = (result[lead.status] || 0) + 1;
    return result;
  }, {});

  return (
    <div className="page-shell">
      <section className="hero" style={{ alignItems: "center" }}>
        <div>
          <p className="eyebrow">V2.13 · PRIVATE RESEARCH WORKSPACE</p>
          <h1>Research inbox</h1>
          <p className="muted">
            Daily suggestions from the existing approved source corpus. Similarity creates
            candidates for human review, not proof of independent demand. Archive weak ideas
            with a reason; archived URLs are never automatically re-added.
          </p>
        </div>
        <form method="post" action="/api/admin/research/refresh">
          <button type="submit" style={{ padding: "12px 16px", cursor: "pointer" }}>
            Refresh research suggestions
          </button>
        </form>
      </section>

      {params.message && (
        <div className="panel" style={{ marginBottom: 20, padding: 14 }}>
          {params.message === "updated" ? "Research review saved." :
            params.message === "refreshed" ? "Candidate and similarity refresh completed." :
            "The action could not be completed. Check that the status and reason are valid."}
        </div>
      )}

      <nav aria-label="Research filters" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
        {["all", ...STATUSES].map((status) => (
          <Link key={status} href={status === "all" ? "/research" : `/research?status=${status}`}
            className="badge"
            style={{
              borderColor: filter === status ? "#9ab1ff" : undefined,
              background: filter === status ? "#303c63" : undefined,
              fontSize: 12, padding: "9px 12px",
            }}>
            {status === "all" ? "All" : status[0].toUpperCase() + status.slice(1)}
            {filter === "all" && status !== "all" ? ` · ${counts[status] || 0}` : ""}
          </Link>
        ))}
      </nav>

      <div style={{ display: "grid", gap: 16 }}>
        {leads.map((lead: any) => {
          const refs = Array.isArray(lead.research_lead_refs) ? lead.research_lead_refs : [];
          const suggested = refs.filter((item: any) => item.review_status === "suggested");
          const confirmed = refs.filter((item: any) => item.review_status === "confirmed");
          return (
            <article className="card" key={lead.id}>
              <div className="card-top">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="badge">{lead.status}</span>
                  <span className="badge">{lead.source_key}</span>
                  <span className="badge">{lead.origin === "curated" ? "Manually curated" : "Automated suggestion"}</span>
                  <span className="badge">{lead.evidence_role === "service_spend" ? "Paid service brief ≠ SaaS demand" : "Reported problem"}</span>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>{when(lead.created_at)}</span>
              </div>
              <h3 style={{ marginTop: 16 }}>{lead.title}</h3>
              <p className="muted">{lead.problem}</p>
              <p style={{ margin: "12px 0", fontSize: 13 }}>
                <a href={lead.source_url} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#bcd0ff", textDecoration: "underline" }}>Open original source ↗</a>
              </p>
              <p className="muted" style={{ fontSize: 12 }}>
                {confirmed.length} manually confirmed related references · {suggested.length} unverified matches ·
                last matching pass: {when(lead.last_scanned_at)}.
                Neither number changes Opportunity scores or proves purchase intent.
              </p>

              {!!refs.length && (
                <details style={{ margin: "14px 0" }}>
                  <summary style={{ cursor: "pointer", color: "#bcd0ff" }}>
                    Review {refs.length} source matches
                  </summary>
                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    {refs.filter((ref: any) => ref.review_status !== "dismissed").map((ref: any) => (
                      <div key={ref.id} style={{ border: "1px solid #33446e", borderRadius: 12, padding: 12 }}>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {displayType(ref.suggestion_type)} · {ref.review_status}
                          · similarity {Math.round(Number(ref.similarity) * 100)}% (not a demand score)
                        </span>
                        <p style={{ margin: "6px 0" }}>
                          <a href={ref.source_url} target="_blank" rel="noopener noreferrer"
                            style={{ color: "#bcd0ff", textDecoration: "underline" }}>{ref.title} ↗</a>
                        </p>
                        {ref.review_status === "suggested" && (
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <form method="post" action="/api/admin/research/reference">
                              <input type="hidden" name="leadId" value={lead.id} />
                              <input type="hidden" name="refId" value={ref.id} />
                              <input type="hidden" name="decision" value="confirmed" />
                              <button type="submit" style={{ padding: "7px 10px", cursor: "pointer" }}>Confirm relevance</button>
                            </form>
                            <form method="post" action="/api/admin/research/reference">
                              <input type="hidden" name="leadId" value={lead.id} />
                              <input type="hidden" name="refId" value={ref.id} />
                              <input type="hidden" name="decision" value="dismissed" />
                              <button type="submit" style={{ padding: "7px 10px", cursor: "pointer" }}>Dismiss match</button>
                            </form>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <form action="/api/admin/research/status" method="post" style={{ display: "grid", gap: 11, marginTop: 18 }}>
                <input type="hidden" name="leadId" value={lead.id} />
                <label style={{ fontSize: 13 }}>
                  Review status (Validate means testing the hypothesis, not validated demand)
                  <select name="status" defaultValue={lead.status}
                    style={{ display: "block", padding: 9, marginTop: 6, maxWidth: 240, width: "100%" }}>
                    {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>
                  Research notes
                  <textarea name="notes" defaultValue={lead.research_notes || ""} rows={2} maxLength={2000}
                    style={{ display: "block", padding: 9, marginTop: 6, width: "100%" }} />
                </label>
                <label style={{ fontSize: 13 }}>
                  Decision reason (required when archiving)
                  <input name="reason" defaultValue={lead.decision_reason || ""} maxLength={500}
                    placeholder="e.g. generic job, existing free solution, no same-problem evidence"
                    style={{ display: "block", padding: 9, marginTop: 6, width: "100%" }} />
                </label>
                <button type="submit" style={{ padding: "10px 14px", justifySelf: "start", cursor: "pointer" }}>Save review</button>
              </form>
            </article>
          );
        })}
        {!leads.length && <div className="empty">
          Nothing in this filter yet. New candidates will arrive after the scheduled source processing and research refresh.
        </div>}
      </div>
    </div>
  );
}
