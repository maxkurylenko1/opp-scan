import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { reclusterSignals } from "@/lib/clustering/semantic";

const ONE_TIME_TOKEN_SHA256 = "1fffacff74dbb16983185b3f65bab602dacc8a3beedf1144f80d0853f838cab5";

function tokenMatches(token: string | null) {
  if (!token) return false;
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"), "utf8");
  const expected = Buffer.from(ONE_TIME_TOKEN_SHA256, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function authorized(request: Request) {
  if (tokenMatches(request.headers.get("x-opp-scan-bootstrap-token"))) return true;
  if (!config.cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${config.cronSecret}`;
}

async function run(limit: number) {
  if (!config.openAiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  try {
    const result = await reclusterSignals(limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("semantic recluster failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const limit = typeof body?.limit === "number" ? body.limit : 100;
  return run(limit);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!tokenMatches(url.searchParams.get("bootstrap"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Number(url.searchParams.get("limit") || "100");
  return run(Number.isFinite(limit) ? limit : 100);
}
