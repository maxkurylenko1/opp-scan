import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { reclusterSignals } from "@/lib/clustering/semantic";

function authorized(request: Request) {
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
