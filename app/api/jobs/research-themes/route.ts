import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { researchThemes } from "@/lib/research/theme-market";

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
    const result = await researchThemes(Number.isFinite(limit) ? limit : 3, force);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("theme market research failed", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
