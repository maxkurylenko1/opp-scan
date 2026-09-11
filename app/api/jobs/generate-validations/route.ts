import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { generateValidationPlans } from "@/lib/validation/generate-plan";
import { getAdminClient } from "@/lib/supabase/admin";

function authorized(request: Request) {
  if (!config.cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${config.cronSecret}`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  try { return JSON.stringify(error); } catch { return String(error); }
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || "3");
  const force = url.searchParams.get("force") === "true";
  try {
    const result = await generateValidationPlans(Number.isFinite(limit) ? limit : 3, force);
    const supabase = getAdminClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data: prospects, error: prospectError } = await supabase.rpc("discover_validation_prospects", {
      p_limit_per_experiment: 20,
      p_min_score: 60,
    });
    if (prospectError) throw prospectError;

    return NextResponse.json({ ok: true, ...result, prospects });
  } catch (error) {
    console.error("validation generation failed", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
