import { NextResponse } from "next/server";
import { authorizedResearchWrite, researchRedirect } from "@/lib/research/admin-write";
import { getAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A reviewed link stays a research annotation: even a confirmed solution,
// issue or independent report does not create an actionable signal or purchase.
export async function POST(request: Request) {
  if (!(await authorizedResearchWrite(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const form = await request.formData().catch(() => null);
  const leadId = String(form?.get("leadId") || "");
  const refId = String(form?.get("refId") || "");
  const decision = String(form?.get("decision") || "");
  const note = String(form?.get("note") || "").trim();
  if (!UUID.test(leadId) || !UUID.test(refId) ||
    !["confirmed", "dismissed"].includes(decision) || note.length > 500 ||
    (decision === "confirmed" && note.length < 12)) {
    return NextResponse.redirect(researchRedirect(request, "invalid"), 303);
  }

  const db = getAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { data: lead, error: leadError } = await db.from("research_leads")
    .select("status").eq("id", leadId).maybeSingle();
  if (leadError || !lead || lead.status === "archived") {
    return NextResponse.redirect(researchRedirect(request, "invalid"), 303);
  }

  const { data, error } = await db.from("research_external_refs")
    .update({
      review_status: decision,
      reviewer_note: note || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", refId)
    .eq("lead_id", leadId)
    .eq("review_status", "suggested")
    .select("id").maybeSingle();
  if (error) {
    console.error("external research reference update failed", error.message);
    return NextResponse.redirect(researchRedirect(request, "error"), 303);
  }
  return NextResponse.redirect(researchRedirect(request,
    data ? "updated" : "invalid"), 303);
}
