import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { reclusterSignals } from "@/lib/clustering/semantic";

const ONE_TIME_TOKEN_SHA256 = "1fffacff74dbb16983185b3f65bab602dacc8a3beedf1144f80d0853f838cab5";

function hasValidOneTimeToken(request: Request) {
  const token = request.headers.get("x-opp-scan-bootstrap-token");
  if (!token) return false;
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"), "utf8");
  const expected = Buffer.from(ONE_TIME_TOKEN_SHA256, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function authorized(request: Request) {
  if (hasValidOneTimeToken(request)) return true;
  if (!config.cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${config.cronSecret}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!config.openAiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });

  let limit = 100;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.limit === "number") limit = body.limit;
  } catch {}

  try {
    const result = await reclusterSignals(limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("semantic recluster failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
