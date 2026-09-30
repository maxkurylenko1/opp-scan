import { NextResponse } from "next/server";
import { authorizedResearchWrite, researchRedirect } from "@/lib/research/admin-write";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!(await authorizedResearchWrite(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { error } = await db.rpc("radar_refresh_research_queue", { p_limit: 15 });
  if (error) {
    console.error("research queue refresh failed", error.message);
    return NextResponse.redirect(researchRedirect(request, "error"), 303);
  }
  return NextResponse.redirect(researchRedirect(request, "refreshed"), 303);
}
