import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { authorizedResearchWrite, researchRedirect } from "@/lib/research/admin-write";
import { searchExternalResearch } from "@/lib/research/external-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function cronAuthorized(request: Request) {
  return Boolean(config.cronSecret &&
    request.headers.get("authorization") === "Bearer " + config.cronSecret);
}

// Vercel Cron adds Authorization from CRON_SECRET; this endpoint does not
// accept browser credentials, service keys or arbitrary unscheduled requests.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await searchExternalResearch(4);
    return NextResponse.json({ ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("external research cron failed", error);
    return NextResponse.json({ error: "External search failed" }, { status: 500 });
  }
}

// A real admin click can refresh the next four eligible leads or one specific
// lead. Every request is bounded and the per-lead cooldown still applies.
export async function POST(request: Request) {
  if (!(await authorizedResearchWrite(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const form = await request.formData().catch(() => null);
  const leadId = String(form?.get("leadId") || "").trim();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (leadId && !uuid.test(leadId)) {
    return NextResponse.redirect(researchRedirect(request, "invalid"), 303);
  }
  try {
    const result = await searchExternalResearch(leadId ? 1 : 4,
      leadId || undefined);
    const redirect = researchRedirect(request, result.leadsSelected ?
      "external" : "external-noop");
    if (result.leadsSelected) {
      redirect.searchParams.set("searched", String(result.leadsSelected));
      redirect.searchParams.set("found", String(result.suggestionsAdded));
    }
    return NextResponse.redirect(redirect, 303);
  } catch (error) {
    console.error("external research admin search failed", error);
    return NextResponse.redirect(researchRedirect(request, "error"), 303);
  }
}
