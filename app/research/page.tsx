import Link from "next/link";
import { isAdminSession } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUSES = ["new", "research", "validate", "archived"] as const;
const STATUS_FILTERS = ["active", "new", "research", "validate", "archived", "all"] as const;
const PRIORITY_FILTERS = ["focus", "p1", "p2", "p3", "all"] as const;

function inboxHref(status: string, priority: string) {
  const query = new URLSearchParams();
  if (status !== "active") query.set("status", status);
  if (priority !== "focus") query.set("priority", priority);
  const suffix = query.toString();
  return suffix ? `/research?${suffix}` : "/research";
}

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
  searchParams: Promise<{ status?: string; priority?: string; message?: string; searched?: string; found?: string }>;
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
  const requestedStatus = params.status || "active";
  const filter = STATUS_FILTERS.includes(requestedStatus as typeof STATUS_FILTERS[number])
    ? requestedStatus : "active";
  const requestedPriority = params.priority || "focus";
  const priorityFilter = PRIORITY_FILTERS.includes(requestedPriority as typeof PRIORITY_FILTERS[number])
    ? requestedPriority : "focus";
  const db = getAdminClient();
  if (!db) return <div className="page-shell"><h1>Supabase is not configured</h1></div>;

  let query = db.from("research_leads")
    .select("id,source_url,source_key,title,problem,evidence_role,origin,status,research_priority,priority_reason,decision_reason,research_notes,search_query,last_external_search_at,external_last_error,created_at,updated_at,reviewed_at,last_scanned_at,research_lead_refs(id,source_key,source_url,title,suggestion_type,similarity,review_status,reviewer_note),research_external_refs(id,provider,source_url,title,source_published_at,suggestion_type,search_query,keyword_overlap,review_status,reviewer_note,created_at)")
    .order("created_at", { ascending: false })
    .limit(100);
  const { data, error } = await query;
  if (error) throw error;

  const allLeads = data || [];
  const counts = allLeads.reduce((result: Record<string, number>, lead: any) => {
    result[lead.status] = (result[lead.status] || 0) + 1;
    return result;
  }, {});
  const leads = allLeads.filter((lead: any) => {
    const statusMatch = filter === "all"
      || (filter === "active" && ["new", "research", "validate"].includes(lead.status))
      || lead.status === filter;
    const priorityMatch = priorityFilter === "all"
      || (priorityFilter === "focus" && ["p1", "p2"].includes(lead.research_priority))
      || lead.research_priority === priorityFilter;
    return statusMatch && priorityMatch;
  }).sort((a: any, b: any) => {
    const priorities: Record<string, number> = { p1: 0, p2: 1, p3: 2 };
    const statuses: Record<string, number> = { validate: 0, research: 1, new: 2, archived: 3 };
    return (priorities[a.research_priority] ?? 3) - (priorities[b.research_priority] ?? 3)
      || (statuses[a.status] ?? 4) - (statuses[b.status] ?? 4)
      || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const visibleCounts = leads.reduce((result: Record<string, number>, lead: any) => {
    result[lead.status] = (result[lead.status] || 0) + 1;
    return result;
  }, {});

  return (
    <div className="page-shell">
      <section className="hero" style={{ alignItems: "center" }}>
        <div>
          <p className="eyebrow">V2.15 · PRECISION RESEARCH WORKSPACE</p>
          <h1>Research inbox</h1>
          <p className="muted">
            Focus view shows only active P1/P2 leads. V2.15 suppresses generic service work,
            internal project tasks and weak purchase-intent false positives before they consume
            validation time. Matching still creates candidates for human review, never proof of demand.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <form method="post" action="/api/admin/research/refresh">
            <button type="submit" style={{ padding: "12px 16px", cursor: "pointer" }}>
              Refresh local suggestions
            </button>
          </form>
          <form method="post" action="/api/jobs/external-research">
            <button type="submit" style={{ padding: "12px 16px", cursor: "pointer" }}>
              Search external sources (max 4)
            </button>
          </form>
        </div>
      </section>

      {params.message && (
        <div className="panel" style={{ marginBottom: 20, padding: 14 }}>
          {params.message === "updated" ? "Research review saved." :
            params.message === "refreshed" ? "Candidate and similarity refresh completed." :
            params.message === "external"
              ? `External search checked ${Number(params.searched || 0)} leads and added ${Number(params.found || 0)} unverified source suggestions.`
              : params.message === "external-noop"
                ? "No leads currently need a new external search. Each lead is searched at most once per week after a successful pass."
                : "The action could not be completed. Check the status, reason and query; or see server logs."}
        </div>
      )}

      <nav aria-label="Research status filters" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        {STATUS_FILTERS.map((status) => (
          <Link key={status} href={inboxHref(status, priorityFilter)}
            className="badge"
            style={{
              borderColor: filter === status ? "#9ab1ff" : undefined,
              background: filter === status ? "#303c63" : undefined,
              fontSize: 12, padding: "9px 12px",
            }}>
            {status === "active" ? "Active" : status[0].toUpperCase() + status.slice(1)}
            {status !== "active" && status !== "all" ? ` · ${counts[status] || 0}` : ""}
          </Link>
        ))}
      </nav>
      <nav aria-label="Research priority filters" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
        {PRIORITY_FILTERS.map((priority) => (
          <Link key={priority} href={inboxHref(filter, priority)}
            className="badge"
            style={{
              borderColor: priorityFilter === priority ? "#9ab1ff" : undefined,
              background: priorityFilter === priority ? "#303c63" : undefined,
              fontSize: 12, padding: "9px 12px",
            }}>
            {priority === "focus" ? "Focus · P1/P2" : priority === "all" ? "All priorities" : priority.toUpperCase()}
          </Link>
        ))}
      </nav>

      <div style={{ display: "grid", gap: 16 }}>
        {leads.map((lead: any) => {
          const refs = Array.isArray(lead.research_lead_refs) ? lead.research_lead_refs : [];
          const suggested = refs.filter((item: any) => item.review_status === "suggested");
          const confirmed = refs.filter((item: any) => item.review_status === "confirmed");
          const external = Array.isArray(lead.research_external_refs) ? lead.research_external_refs : [];
          const externalSuggested = external.filter((item: any) => item.review_status === "suggested");
          const externalConfirmed = external.filter((item: any) => item.review_status === "confirmed");
          return (
            <article className="card" key={lead.id}>
              <div className="card-top">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="badge">{lead.research_priority?.toUpperCase() || "P3"}</span>
                  <span className="badge">{lead.status}</span>
                  <span className="badge">{lead.source_key}</span>
                  <span className="badge">{lead.origin === "curated" ? "Manually curated" : "Automated suggestion"}</span>
                  <span className="badge">{lead.evidence_role === "service_spend" ? "Paid service brief ≠ SaaS demand" : "Reported problem"}</span>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>{when(lead.created_at)}</span>
              </div>
              <h3 style={{ marginTop: 16 }}>{lead.title}</h3>
              <p className="muted">{lead.problem}</p>
              {lead.priority_reason && (
                <p className="muted" style={{ fontSize: 12 }}>
                  Priority: {lead.priority_reason}
                </p>
              )}
              <p style={{ margin: "12px 0", fontSize: 13 }}>
                <a href={lead.source_url} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#bcd0ff", textDecoration: "underline" }}>Open original source ↗</a>
              </p>
              <p className="muted" style={{ fontSize: 12 }}>
                {confirmed.length} manually confirmed related references · {suggested.length} unverified matches ·
                last matching pass: {when(lead.last_scanned_at)}.
                Neither number changes Opportunity scores or proves purchase intent.
              </p>
              <p className="muted" style={{ fontSize: 12 }}>
                External search: {when(lead.last_external_search_at)} ·
                {externalSuggested.length} unverified source suggestions ·
                {externalConfirmed.length} manually reviewed source links.
                A confirmed link is not a verified independent buyer or paid commitment.
              </p>
              {lead.external_last_error && (
                <p className="muted" style={{ fontSize: 12 }}>
                  Some external searches could not complete: {lead.external_last_error}.
                  Retry after the cooldown rather than bypassing API rate limits.
                </p>
              )}
              {lead.status !== "archived" && (
                <form method="post" action="/api/jobs/external-research" style={{ margin: "12px 0" }}>
                  <input type="hidden" name="leadId" value={lead.id} />
                  <button type="submit" style={{ padding: "7px 11px", cursor: "pointer" }}>
                    Search this lead's external sources
                  </button>
                </form>
              )}

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

              {!!external.length && (
                <details style={{ margin: "14px 0" }}>
                  <summary style={{ cursor: "pointer", color: "#bcd0ff" }}>
                    External searches: {externalSuggested.length} suggestions,
                    {" "}{externalConfirmed.length} manually reviewed
                  </summary>
                  <p className="muted" style={{ fontSize: 12, margin: "10px 0" }}>
                    These are official HN/GitHub search hits, not ingested signals.
                    GitHub issues may be internal project tasks; Show HN posts
                    represent potential competitors, not buyers. Check each
                    original source and author before confirming relevance.
                  </p>
                  <div style={{ display: "grid", gap: 10 }}>
                    {external.filter((ref: any) => ref.review_status !== "dismissed").map((ref: any) => (
                      <div key={ref.id} style={{ border: "1px solid #33446e", borderRadius: 12, padding: 12 }}>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {ref.provider === "hackernews" ? "Hacker News" : "GitHub Issues"} ·
                          {ref.suggestion_type === "possible_solution"
                            ? "Possible existing solution; NOT demand"
                            : ref.suggestion_type === "github_issue"
                              ? "Possibly related issue; buyer identity unverified"
                              : "Possible user problem; independence unverified"} ·
                          {ref.review_status} ·
                          {ref.keyword_overlap} overlapping keywords (not a demand score)
                        </span>
                        <p style={{ margin: "7px 0" }}>
                          <a href={ref.source_url} target="_blank" rel="noopener noreferrer"
                            style={{ color: "#bcd0ff", textDecoration: "underline" }}>
                            {ref.title} ↗
                          </a>
                        </p>
                        <p className="muted" style={{ fontSize: 12, margin: "4px 0 9px" }}>
                          Query: {ref.search_query} · Published: {when(ref.source_published_at)}
                        </p>
                        {ref.reviewer_note && (
                          <p className="muted" style={{ fontSize: 12 }}>{ref.reviewer_note}</p>
                        )}
                        {ref.review_status === "suggested" && (
                          <form method="post" action="/api/admin/research/external-reference"
                            style={{ display: "grid", gap: 8 }}>
                            <input type="hidden" name="leadId" value={lead.id} />
                            <input type="hidden" name="refId" value={ref.id} />
                            <input name="note" maxLength={500}
                              placeholder="Why is this same problem or a relevant existing solution?"
                              style={{ width: "100%", padding: 9 }} />
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <button type="submit" name="decision" value="confirmed"
                                style={{ padding: "7px 10px", cursor: "pointer" }}>
                                Confirm relevance (reason required)
                              </button>
                              <button type="submit" name="decision" value="dismissed"
                                style={{ padding: "7px 10px", cursor: "pointer" }}>
                                Dismiss
                              </button>
                            </div>
                          </form>
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
                  Targeted external search query (two or more specific words)
                  <input name="searchQuery" defaultValue={lead.search_query || ""} maxLength={100}
                    placeholder="e.g. Claude Codex context handoff"
                    style={{ display: "block", padding: 9, marginTop: 6, width: "100%" }} />
                  <span className="muted" style={{ fontSize: 12 }}>
                    Leave empty to derive from the original title. Changes reset the search cooldown.
                    Only this query is sent to HN/GitHub; private notes are not shared.
                  </span>
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
          Nothing in this view. P3 auto-triage stays outside the default focus; use All priorities or Archived to inspect it.
        </div>}
      </div>
    </div>
  );
}
