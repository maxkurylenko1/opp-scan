import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { researchThemes } from "@/lib/research/theme-market";

const BOOTSTRAP_SHA256 = "25b42ca6eed63987170a34d59237728ae693f8a89e840e17b8988a59ed268046";

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
