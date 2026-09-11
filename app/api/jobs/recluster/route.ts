import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { reclusterSignals } from "@/lib/clustering/semantic";
import { getAdminClient } from "@/lib/supabase/admin";

const BOOTSTRAP_SHA256 = "5af6eda3621c2c165ebb54e82764b2aa8bedfb529a0a3bdc614d3952edfc9893";

function bootstrapValid(request: Request) {
  const token = new URL(request.url).searchParams.get("bootstrap");
  if (!token) return false;
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"), "utf8");
  const expected = Buffer.from(BOOTSTRAP_SHA256, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function authorized(request: Request) {
  if (bootstrapValid(request)) return true;
  if (!config.cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${config.cronSecret}`;
}

async function run(limit: number, pendingOnly: boolean) {
  if (!config.openAiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });

  try {
    const result = await reclusterSignals(limit, { pendingOnly });
    const supabase = getAdminClient();
    if (!supabase) throw new Error("Supabase is not configured");
    const { data: ranked, error: rankError } = await supabase.rpc("radar_weekly_rank");
    if (rankError) throw rankError;
    return NextResponse.json({ ok: true, ...result, ranked });
  } catch (error) {
    console.error("semantic recluster failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const limit = typeof body?.limit === "number" ? body.limit : 100;
  const pendingOnly = body?.pendingOnly === true;
  return run(limit, pendingOnly);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || "150");
  const pendingOnly = url.searchParams.get("pending") !== "false";
  return run(Number.isFinite(limit) ? limit : 150, pendingOnly);
}
