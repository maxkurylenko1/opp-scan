import { NextResponse } from "next/server";
import { authorizedResearchWrite, researchRedirect } from "@/lib/research/admin-write";
import { getAdminClient } from "@/lib/supabase/admin";
import { validateResearchQuery } from "@/lib/research/external-search";

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
  const rawQuery = String(form?.get("searchQuery") || "").trim();
  const searchQuery = rawQuery ? validateResearchQuery(rawQuery) : null;
  if ((rawQuery && !searchQuery) || !UUID.test(leadId) || !STATUSES.has(status) || reason.length > 500 ||
      notes.length > 2000 || (status === "archived" && !reason)) {
    return NextResponse.redirect(researchRedirect(request, "invalid"), 303);
  }

  const db = getAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { data: previous, error: readError } = await db.from("research_leads")
    .select("id,search_query").eq("id", leadId).maybeSingle();
  if (readError || !previous) {
    return NextResponse.redirect(researchRedirect(request, "invalid"), 303);
  }
  const patch: Record<string, unknown> = {
    status,
    search_query: searchQuery,
    decision_reason: reason || null,
    research_notes: notes || null,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (previous.search_query !== searchQuery) {
    patch.last_external_search_at = null;
    patch.external_last_error = null;
  }
  const { data, error } = await db.from("research_leads")
    .update(patch)
    .eq("id", leadId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("research status update failed", error.message);
    return NextResponse.redirect(researchRedirect(request, "error"), 303);
  }
  return NextResponse.redirect(researchRedirect(request, data ? "updated" : "invalid"), 303);
}
