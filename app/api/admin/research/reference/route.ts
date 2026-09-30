import { NextResponse } from "next/server";
import { authorizedResearchWrite, researchRedirect } from "@/lib/research/admin-write";
import { getAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!(await authorizedResearchWrite(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const leadId = String(form?.get("leadId") || "");
  const refId = String(form?.get("refId") || "");
  const decision = String(form?.get("decision") || "");
  if (!UUID.test(leadId) || !UUID.test(refId) ||
      !["confirmed", "dismissed"].includes(decision)) {
    return NextResponse.redirect(researchRedirect(request, "invalid"), 303);
  }

  const db = getAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { data, error } = await db.from("research_lead_refs")
    .update({ review_status: decision, reviewed_at: new Date().toISOString() })
    .eq("id", refId)
    .eq("lead_id", leadId)
    .eq("review_status", "suggested")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("research reference review failed", error.message);
    return NextResponse.redirect(researchRedirect(request, "error"), 303);
  }
  return NextResponse.redirect(researchRedirect(request, data ? "updated" : "invalid"), 303);
}
