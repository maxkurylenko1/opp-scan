import { NextResponse } from "next/server";
import { authorizedResearchWrite, researchRedirect } from "@/lib/research/admin-write";
import { getAdminClient } from "@/lib/supabase/admin";

const STATUSES = new Set(["new", "research", "validate", "archived"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!(await authorizedResearchWrite(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const leadId = String(form?.get("leadId") || "");
  const status = String(form?.get("status") || "");
  const reason = String(form?.get("reason") || "").trim();
  const notes = String(form?.get("notes") || "").trim();
  if (!UUID.test(leadId) || !STATUSES.has(status) || reason.length > 500 ||
      notes.length > 2000 || (status === "archived" && !reason)) {
    return NextResponse.redirect(researchRedirect(request, "invalid"), 303);
  }

  const db = getAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { data, error } = await db.from("research_leads")
    .update({
      status,
      decision_reason: reason || null,
      research_notes: notes || null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("research status update failed", error.message);
    return NextResponse.redirect(researchRedirect(request, "error"), 303);
  }
  return NextResponse.redirect(researchRedirect(request, data ? "updated" : "invalid"), 303);
}
